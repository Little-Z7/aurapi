package helper

import (
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
)

func ResolveIncomingBillingExprRequestInput(c *gin.Context, info *relaycommon.RelayInfo) (billingexpr.RequestInput, error) {
	if info != nil && info.BillingRequestInput != nil {
		input := cloneRequestInput(*info.BillingRequestInput)
		merged := cloneStringMap(info.RequestHeaders)
		maps.Copy(merged, input.Headers)
		input.Headers = merged
		return input, nil
	}

	input := billingexpr.RequestInput{}
	if info != nil {
		input.Headers = cloneStringMap(info.RequestHeaders)
	}

	bodyBytes, err := readIncomingBillingExprBody(c)
	if err != nil {
		return billingexpr.RequestInput{}, err
	}
	input.Body = bodyBytes
	return input, nil
}

// ResolveImageBillingRequestInput freezes only the validated scalar image
// parameters needed by pricing. Image files, prompts and base64 payloads are
// deliberately excluded, including for multipart edits.
func ResolveImageBillingRequestInput(c *gin.Context, info *relaycommon.RelayInfo, input billingexpr.RequestInput) (billingexpr.RequestInput, error) {
	request, ok := info.Request.(*dto.ImageRequest)
	if !ok {
		return input, nil
	}
	count, err := request.ImageCount(false)
	if err != nil {
		return input, err
	}
	body, err := imageBillingFacts(request.Extra)
	if err != nil {
		return input, err
	}
	maps.Copy(body, map[string]any{"model": request.Model, "n": count, "size": request.Size, "quality": request.Quality})
	if request.BillingParameters != nil {
		body["parameters"] = request.BillingParameters
	}
	encoded, err := common.Marshal(body)
	if err != nil {
		return input, err
	}
	input.Body = encoded
	input.ImageCount = &count
	return input, nil
}

// imageBillingLabelMaxLength bounds the free-form provider labels copied into
// the billing context. They only select a price tier, so longer values are
// malformed rather than meaningful.
const imageBillingLabelMaxLength = 32

// imageBillingFacts extracts the provider image fields that select a price
// tier but are not declared on dto.ImageRequest (OpenRouter Images API:
// resolution, aspect_ratio, input_references). Only bounded labels and the
// reference count are kept; reference payloads never enter the billing body.
// Resolution is upper-cased so a case variant accepted upstream cannot fall
// through to a cheaper tier.
func imageBillingFacts(extra map[string]json.RawMessage) (map[string]any, error) {
	facts := map[string]any{"input_reference_count": 0}
	for _, key := range []string{"resolution", "aspect_ratio"} {
		raw, exists := extra[key]
		if !exists {
			continue
		}
		var value string
		if err := common.Unmarshal(raw, &value); err != nil {
			return nil, fmt.Errorf("%s must be a string", key)
		}
		value = strings.TrimSpace(value)
		if len(value) > imageBillingLabelMaxLength {
			return nil, fmt.Errorf("%s must be at most %d characters", key, imageBillingLabelMaxLength)
		}
		if key == "resolution" {
			value = strings.ToUpper(value)
		}
		if value != "" {
			facts[key] = value
		}
	}
	if raw, exists := extra["input_references"]; exists {
		var references []json.RawMessage
		if err := common.Unmarshal(raw, &references); err != nil {
			return nil, errors.New("input_references must be an array")
		}
		if len(references) > dto.MaxImageN {
			return nil, fmt.Errorf("input_references must contain at most %d items", dto.MaxImageN)
		}
		facts["input_reference_count"] = len(references)
	}
	return facts, nil
}

func BuildBillingExprRequestInputFromRequest(request dto.Request, headers map[string]string) (billingexpr.RequestInput, error) {
	input := billingexpr.RequestInput{
		Headers: cloneStringMap(headers),
	}
	if request == nil {
		return input, nil
	}

	bodyBytes, err := common.Marshal(request)
	if err != nil {
		return billingexpr.RequestInput{}, err
	}
	input.Body = bodyBytes
	return input, nil
}

func readIncomingBillingExprBody(c *gin.Context) ([]byte, error) {
	if c == nil || c.Request == nil || !isJSONContentType(c.Request.Header.Get("Content-Type")) {
		return nil, nil
	}
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return nil, err
	}
	return storage.Bytes()
}

func cloneRequestInput(src billingexpr.RequestInput) billingexpr.RequestInput {
	input := billingexpr.RequestInput{
		Headers: cloneStringMap(src.Headers),
	}
	if src.ImageCount != nil {
		count := *src.ImageCount
		input.ImageCount = &count
	}
	if len(src.Body) > 0 {
		input.Body = append([]byte(nil), src.Body...)
	}
	return input
}

func isJSONContentType(contentType string) bool {
	contentType = strings.ToLower(strings.TrimSpace(contentType))
	return strings.HasPrefix(contentType, "application/json")
}

func cloneStringMap(src map[string]string) map[string]string {
	if len(src) == 0 {
		return map[string]string{}
	}
	dst := make(map[string]string, len(src))
	for key, value := range src {
		if strings.TrimSpace(key) == "" {
			continue
		}
		dst[key] = value
	}
	return dst
}
