const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, OutputType, Type } = require('@google/generative-ai');

// Based on your aarogya_api_contract.json and reference aiService.ts for schema expectations
const GEMINI_CONFIG = {
  MODEL_NAME: 'gemini-2.0-flash', // Updated as per user request
  SYSTEM_PROMPT: `You are an AI assistant specialized in extracting medical information from documents for claim processing.
Analyze the provided medical document and extract the following information in a structured JSON format.
If any information is not found in the document, use null for that field or omit the field if appropriate for the schema.
Be precise and accurate in your extraction. Ensure dates are in YYYY-MM-DD format if possible.
Focus on details relevant to a medical claim, such as patient information, provider information, service dates, diagnoses, procedures, and amounts.`,
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

class AIService {
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('CRITICAL: GEMINI_API_KEY environment variable is not set.');
      throw new Error('Gemini API key not provided. AI Service cannot function.');
    }
    // Initialize with the SDK
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.modelName = GEMINI_CONFIG.MODEL_NAME;
    this.medicalClaimSchema = MEDICAL_CLAIM_SCHEMA;
    console.log(`[AIService Constructor] Service initialized.`);
  }

  async extractMedicalDataFromDocument(documentBuffer, mimeType, userId = null) {
    try {
      if (userId) {
        console.log(`[AIService] Data extraction triggered for userId: ${userId}`);
      } else {
        console.log(`[AIService] Data extraction triggered.`);
      }
      const model = this.genAI.getGenerativeModel({
        model: this.modelName,
        safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
        generationConfig: {
            responseMimeType: "application/json",
            // @ts-ignore - this is a valid way to pass schema in recent SDK versions
            responseSchema: this.medicalClaimSchema,
          },
          systemInstruction: GEMINI_CONFIG.SYSTEM_PROMPT,
      });

      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: mimeType,
            data: documentBuffer.toString('base64'),
          },
        },
      ]);

      const response = result.response;
      const extractedText = response.text();
      // No logging of extractedText or sensitive data
      const extractedData = JSON.parse(extractedText || '{}');
      // No logging of extractedData
      return extractedData;

    } catch (error) {
      console.error('[AIService] Error extracting medical data:', error);
      // Log more detailed error if available
      if (error.response && error.response.data) {
        console.error('[AIService] Error response data:', error.response.data);
      }
      throw new Error('Failed to extract medical data from document using AI service.');
    }
  }
}

module.exports = new AIService();