const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

// Based on your aarogya_api_contract.json and reference aiService.ts for schema expectations
const GEMINI_CONFIG = {
  MODEL_NAME: 'gemini-2.0-flash',
  SINGLE_PASS_PROMPT: `You are an AI assistant specialized in processing medical documents for claim processing.
    Your task is to extract all relevant text content from the provided document and structure it into a JSON array of objects.

    For each significant piece of text (like a line, key-value pair, or identifiable entity):
    1. Determine the most appropriate label from the list below, incase not listed below feel free to create a new label. If it's a key-value pair (e.g., "Phone No.: 9429416464"), use the key as the label.
    2. Extract the actual value.
    3. Assign a confidence score between 0 and 1.
    4. Preserve the original order of appearance as much as possible.
    5. Remove any empty lines or irrelevant visual artifacts.

    Common labels to use:
    - patient_name: Patient's/Customer's full name
    - patient_phone: Patient's/Customer's phone/mobile number
    - patient_dob: Patient's/Customer's date of birth
    - service_date: Date of medical service (YYYY-MM-DD)
    - provider_name: Hospital or pharmacy name
    - provider_phone: Provider's phone number
    - provider_address: Provider's address
    - provider_gst: Provider's GST number
    - provider_license: Provider's license number
    - amount: Main total amount (net payable)
    - subtotal_amount: Subtotal before discounts
    - discount_amount: Discount amount
    - tax_amount: Tax/GST amount
    - item_amount: Individual item amounts
    - diagnosis: Medical conditions
    - procedure: Medical procedures
    - medication: Prescribed medications
    - insurance_id: Insurance policy numbers
    - invoice_number: Bill or invoice numbers
    - prescription_id: Prescription reference numbers

    For dates, standardize to YYYY-MM-DD format when possible.
    For amounts, extract only the numeric value.
    For phone numbers, include only the digits.

    If a line or text segment doesn't fit any specific label, use "Other".

    Return a JSON object with a single key "lines" containing an array of these objects:
    {
      "lines": [
        {
          "key": "label",
          "value": "extracted value",
          "confidence": 0.95
        },
        // ... more objects
      ]
    }

    Be precise and accurate in your labeling and value extraction.
    `, // Merged prompt for extraction and analysis
  CONFIDENCE_THRESHOLD: 0.7,
  BATCH_SIZE: 10, // BATCH_SIZE is no longer directly used for model calls but kept for potential metadata or future use
  MAX_RETRIES: 3,
  INITIAL_RETRY_DELAY: 1000, // 1 second
  MAX_RETRY_DELAY: 10000, // 10 seconds
};

// Define a schema that aligns with potential claim data and your API contract
const MEDICAL_CLAIM_SCHEMA = {
  type: "object",
  properties: {
    patientInfo: {
      type: "object",
      properties: {
        name: { type: "string", description: "Patient's full name" },
        dob: { type: "string", description: "Patient's date of birth (YYYY-MM-DD)" },
        gender: { type: "string", description: "Patient's gender (Male, Female, Other)" },
        insuranceId: { type: "string", description: "Patient's insurance ID number" },
      },
      required: ["name"]
    },
    providerInfo: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the hospital or medical provider" },
        address: { type: "string", description: "Address of the hospital or medical provider" },
        providerNumber: { type: "string", description: "Provider's official number or ID" },
      },
      required: ["name", "providerNumber"]
    },
    claimDetails: {
      type: "object",
      properties: {
        serviceDate: { type: "string", description: "Date of service (YYYY-MM-DD)" },
        dischargeDate: { type: "string", description: "Date of discharge, if applicable (YYYY-MM-DD)" },
        totalAmount: { type: "number", description: "Total amount of the claim" },
        coveredAmount: { type: "number", description: "Amount covered by insurance" },
        patientResponsibility: { type: "number", description: "Amount patient is responsible for" },
        currency: { type: "string", description: "Currency of the amount (e.g., USD, INR)", default: "INR" },
        claimType: { type: "string", description: "Type of claim (e.g., INPATIENT, OUTPATIENT, CONSULTATION)" },
        diagnosisCodes: { type: "array", items: { type: "string" }, description: "List of diagnosis codes (e.g., ICD-10)" },
        procedureCodes: { type: "array", items: { type: "string" }, description: "List of procedure codes (e.g., CPT)" },
      },
      required: ["serviceDate", "totalAmount"]
    },
    extractedMedicalEntities: {
      type: "array",
      description: "Key medical entities extracted, like medications, conditions.",
      items: {
        type: "object",
        properties: {
          type: { type: "string", description: "Type of entity (e.g., MEDICATION, CONDITION)" },
          text: { type: "string", description: "The actual text of the entity" },
          score: { type: "number", description: "Confidence score of extraction" }
        }
      }
    }
  },
  required: ["patientInfo", "providerInfo", "claimDetails"]
};

// Helper function to convert to snake_case
const toSnakeCase = (str) => {
  return str
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_');
};

// Helper function to parse key-value pairs with improved logic
const parseKeyValuePair = (text) => {
  // List of known keys that should be preserved
  const knownKeys = [
    'phone no', 'mobile', 'gst no', 'd.l no', 'invoice no',
    'prep by', 'amount in words', 'net payable', 'sub total',
    'discount', 'tax', 'gst', 'total', 'balance'
  ];

  // Check if the text contains a known key
  const hasKnownKey = knownKeys.some(key =>
    text.toLowerCase().startsWith(key.toLowerCase())
  );

  if (hasKnownKey) {
    const keyValueMatch = text.match(/^([^:]+):\s*(.+)$/);
    if (keyValueMatch) {
      const [, key, value] = keyValueMatch;
      return {
        key: toSnakeCase(key.trim()),
        value: value.trim()
      };
    }
  }

  // Handle time values (HH:MM format)
  if (/^\d{1,2}:\d{2}$/.test(text.trim())) {
    return {
      key: 'time',
      value: text.trim()
    };
  }

  // Handle address components
  if (text.includes(',')) {
    const parts = text.split(',').map(part => part.trim());
    if (parts.length > 1) {
      // If it looks like an address, keep it as one piece
      return {
        key: 'address_component',
        value: text.trim()
      };
    }
  }

  return null;
};

// Helper function to identify main amount with improved logic
const isMainAmount = (line, allLines) => {
  const mainAmountIndicators = [
    'net payable',
    'total payable',
    'amount payable',
    'final amount',
    'grand total',
    'net amount',
    'e. & o.e. net payable',
    'balance due',
    'amount due'
  ];

  // Check if this line or nearby lines contain main amount indicators
  const nearbyText = allLines
    .slice(Math.max(0, line.index - 2), line.index + 3)
    .map(l => l.value.toLowerCase())
    .join(' ');

  const isMainAmount = mainAmountIndicators.some(indicator =>
    nearbyText.includes(indicator.toLowerCase())
  );

  // Additional check for amount in words
  const hasAmountInWords = allLines
    .slice(Math.max(0, line.index - 1), line.index + 2)
    .some(l => l.key === 'amount_in_words');

  return isMainAmount || hasAmountInWords;
};

// Helper function to determine amount type
const determineAmountType = (line, allLines) => {
  const nearbyText = allLines
    .slice(Math.max(0, line.index - 2), line.index + 3)
    .map(l => l.value.toLowerCase())
    .join(' ');

  if (isMainAmount(line, allLines)) {
    return 'amount';
  }

  if (nearbyText.includes('sub total') || nearbyText.includes('subtotal')) {
    return 'subtotal_amount';
  }

  if (nearbyText.includes('discount') || nearbyText.includes('off')) {
    return 'discount_amount';
  }

  if (nearbyText.includes('tax') || nearbyText.includes('gst')) {
    return 'tax_amount';
  }

  // If it's near a medication or procedure, it's likely an item amount
  const isNearItem = allLines
    .slice(Math.max(0, line.index - 1), line.index + 2)
    .some(l => l.key === 'medication' || l.key === 'procedure');

  return isNearItem ? 'item_amount' : 'other_amount';
};

// Helper function for exponential backoff
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class AIService {
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('CRITICAL: GEMINI_API_KEY environment variable is not set.');
      throw new Error('Gemini API key not provided. AI Service cannot function.');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.modelName = GEMINI_CONFIG.MODEL_NAME;
    this.medicalClaimSchema = MEDICAL_CLAIM_SCHEMA;
    console.log(`[AIService Constructor] Service initialized with line-by-line extraction.`);
    this.retryConfig = {
      maxRetries: GEMINI_CONFIG.MAX_RETRIES,
      initialDelay: GEMINI_CONFIG.INITIAL_RETRY_DELAY,
      maxDelay: GEMINI_CONFIG.MAX_RETRY_DELAY
    };
  }

  // Helper method to handle retries
  async withRetry(operation, operationName) {
    let lastError;
    let delay = this.retryConfig.initialDelay;

    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // Check if error is retryable
        const isRetryable = error.status === 503 || // Service Unavailable
                          error.status === 429 || // Too Many Requests
                          error.status === 500 || // Internal Server Error
                          error.status === 502;   // Bad Gateway

        if (!isRetryable || attempt === this.retryConfig.maxRetries) {
          // Format user-friendly error message based on the error type
          let userMessage;
          if (error.status === 503) {
            userMessage = 'AI service is currently overloaded. Please try again in a few moments.';
          } else if (error.status === 429) {
            userMessage = 'AI service rate limit reached. Please try again later.';
          } else if (error.status === 500 || error.status === 502) {
            userMessage = 'AI service is experiencing technical difficulties. Please try again later.';
          } else {
            userMessage = 'Failed to process document using AI service.';
          }

          // Create a new error with the user-friendly message
          const userError = new Error(userMessage);
          userError.status = error.status;
          userError.originalError = error;
          throw userError;
        }

        console.log(`[AIService] ${operationName} attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`);
        await sleep(delay);

        // Exponential backoff with jitter
        delay = Math.min(
          delay * 2 + Math.random() * 1000,
          this.retryConfig.maxDelay
        );
      }
    }

    throw lastError;
  }

  async extractMedicalDataFromDocument(documentBuffer, mimeType, userId = null) {
    try {
      if (userId) {
        console.log(`[AIService] Data extraction triggered for userId: ${userId}`);
      } else {
        console.log(`[AIService] Data extraction triggered.`);
      }

      // Initialize model with settings
      const model = this.genAI.getGenerativeModel({
        model: this.modelName,
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
        generationConfig: {
          temperature: 0.1, // Lower temperature for more consistent results
          topP: 0.8,
          topK: 40,
        },
      });

      // Step 1: Perform single-pass extraction and analysis with retry
      // Removed the separate text extraction step and the batch processing loop.
      const result = await this.withRetry(
        async () => model.generateContent([
          { text: GEMINI_CONFIG.SINGLE_PASS_PROMPT },
          {
            inlineData: {
              mimeType: mimeType,
              data: documentBuffer.toString('base64'),
            },
          },
        ]),
        'Single Pass Extraction and Analysis'
      );

      let processedLines;
      try {
        // Clean the response text before parsing
        let responseText = result.response.text();
        // Remove any markdown code block indicators
        responseText = responseText.replace(/```json\n?|\n?```/g, '');
        // Remove any leading/trailing whitespace
        responseText = responseText.trim();

        const parsedResponse = JSON.parse(responseText);

        if (!parsedResponse || !Array.isArray(parsedResponse.lines)) {
          console.warn('[AIService] Invalid response format for single pass analysis, using fallback');
          // Log the unexpected response for debugging - REMOVED TO AVOID LOGGING SENSITIVE DATA
          // console.log('[AIService] Unexpected response:', responseText);
          throw new Error('Invalid response format');
        }

        // Validate each line has required fields
        processedLines = parsedResponse.lines.filter(line =>
          line &&
          typeof line.key === 'string' &&
          typeof line.value === 'string' &&
          typeof line.confidence === 'number' &&
          line.confidence >= 0 &&
          line.confidence <= 1
        );

        if (processedLines.length === 0) {
          // Log the unexpected response for debugging if no valid lines are extracted - REMOVED TO AVOID LOGGING SENSITIVE DATA
          // console.log('[AIService] No valid lines extracted. Unexpected response:', responseText);
          throw new Error('No valid lines extracted in response');
        }

      } catch (error) {
        console.error('[AIService] Error processing single pass analysis response:', error);
        // If parsing or validation fails, return an empty lines array and log the error.
        // We cannot fall back to labeling initial lines as "Other" as we no longer have them separately.
         processedLines = [];
      }

      // Step 2: Apply confidence threshold and post-process
      const thresholdedLines = processedLines
        .filter(line => {
          // Filter out empty values and special characters
          if (!line.value || line.value.trim() === '' ||
              line.value === '[' || line.value === ']' ||
              line.value === '{' || line.value === '}') {
            return false;
          }
          // Keep only lines with confidence above threshold
          return line.confidence >= GEMINI_CONFIG.CONFIDENCE_THRESHOLD;
        })
        .map((line, index, allLines) => {
          let key = line.key;
          let value = line.value;

          // Post-process based on key type for standardization
          if (key.toLowerCase().includes('amount') || key.toLowerCase().includes('payable') || key.toLowerCase().includes('total')) {
            // Extract numeric value from amount
            const match = value.match(/\d+(\.\d+)?/);
            if (match) {
              value = match[0];
              // Keep the key assigned by the AI
            } else {
               // If numeric extraction fails, keep original value and potentially change key to 'Other'?
               // For now, keep original value and key.
            }
          } else if (key === 'service_date' || key === 'patient_dob') {
            // Try to standardize date format
            try {
              const date = new Date(value);
              if (!isNaN(date)) {
                value = date.toISOString().split('T')[0];
              } else {
                 // If date parsing fails, keep original value.
              }
            } catch (e) {
              // Keep original value if date parsing fails
            }
          } else if (key === 'patient_phone' || key === 'provider_phone') {
            // Extract only digits from phone numbers
            value = value.replace(/\D/g, '');
          } else if (key === 'address_component') {
            // If it's part of a provider address, update the key (this logic might still be useful)
            const isProviderAddress = allLines
              .slice(Math.max(0, index - 2), index + 2)
              .some(l => l.key === 'provider_name' || l.key === 'provider_address');
            key = isProviderAddress ? 'provider_address' : 'address';
          }
           // Add more specific standardization/refinement here if needed based on other keys

          return {
            key,
            value,
            confidence: line.confidence
          };
        });

      // Return structured data
      return {
        extractedData: {
          lines: thresholdedLines,
          metadata: {
            processedAt: new Date().toISOString(),
            confidenceThreshold: GEMINI_CONFIG.CONFIDENCE_THRESHOLD,
            totalLines: processedLines.length,
            processedLines: thresholdedLines.length,
            batchSize: GEMINI_CONFIG.BATCH_SIZE,
            filteredLines: processedLines.length - thresholdedLines.length // Add count of filtered lines
          }
        }
      };

    } catch (error) {
      console.error('[AIService] Error extracting medical data:', error);
      if (error.response && error.response.data) {
        console.error('[AIService] Error response data:', error.response.data);
      }
      // Use the user-friendly error message if available
      throw new Error(error.message || 'Failed to extract medical data from document using AI service.');
    }
  }
}

module.exports = new AIService();