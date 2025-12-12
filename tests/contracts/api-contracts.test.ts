/**
 * API Contract Tests
 * 
 * Validates that API responses match their JSON Schema contracts.
 * These tests can run against mock data or a real endpoint.
 */

import { describe, it, expect } from '@jest/globals';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

// Load contract schema
const contractSchema = require('../../contracts/qc-api.schema.json');

// Initialize AJV with formats support
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

// Compile validators
const validators = {
  qcJob: ajv.compile(contractSchema.definitions.QCJob),
  qcResult: ajv.compile(contractSchema.definitions.QCResult),
  healthResponse: ajv.compile(contractSchema.definitions.HealthResponse),
  errorResponse: ajv.compile(contractSchema.definitions.ErrorResponse),
  dlqEntry: ajv.compile(contractSchema.definitions.DLQEntry),
};

describe('API Contract Tests', () => {
  describe('QCJob Schema', () => {
    it('should validate a valid QC job', () => {
      const validJob = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'running',
        progress: 45,
        file_name: 'test-video.mp4',
        source_type: 'upload',
        created_at: '2024-12-12T10:00:00Z',
      };

      const isValid = validators.qcJob(validJob);
      expect(isValid).toBe(true);
      if (!isValid) console.log(validators.qcJob.errors);
    });

    it('should reject job with invalid status', () => {
      const invalidJob = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'invalid_status', // Invalid
        progress: 45,
      };

      const isValid = validators.qcJob(invalidJob);
      expect(isValid).toBe(false);
    });

    it('should reject job with progress > 100', () => {
      const invalidJob = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'running',
        progress: 150, // Invalid
      };

      const isValid = validators.qcJob(invalidJob);
      expect(isValid).toBe(false);
    });

    it('should reject job without required fields', () => {
      const invalidJob = {
        progress: 45,
        // Missing id and status
      };

      const isValid = validators.qcJob(invalidJob);
      expect(isValid).toBe(false);
    });
  });

  describe('HealthResponse Schema', () => {
    it('should validate a valid health response', () => {
      const validHealth = {
        status: 'healthy',
        timestamp: '2024-12-12T10:00:00Z',
        services: [
          {
            name: 'database',
            status: 'ok',
            latency: 15,
            message: 'Connected',
          },
          {
            name: 'qc_worker',
            status: 'ok',
            latency: 100,
          },
        ],
      };

      const isValid = validators.healthResponse(validHealth);
      expect(isValid).toBe(true);
      if (!isValid) console.log(validators.healthResponse.errors);
    });

    it('should reject health response with invalid status', () => {
      const invalidHealth = {
        status: 'good', // Invalid - should be healthy/degraded/unhealthy
        timestamp: '2024-12-12T10:00:00Z',
      };

      const isValid = validators.healthResponse(invalidHealth);
      expect(isValid).toBe(false);
    });
  });

  describe('ErrorResponse Schema', () => {
    it('should validate a valid error response', () => {
      const validError = {
        error: 'Something went wrong',
        code: 'INTERNAL_ERROR',
        details: {
          field: 'file_name',
        },
      };

      const isValid = validators.errorResponse(validError);
      expect(isValid).toBe(true);
    });

    it('should reject error response without error field', () => {
      const invalidError = {
        code: 'INTERNAL_ERROR',
        // Missing error field
      };

      const isValid = validators.errorResponse(invalidError);
      expect(isValid).toBe(false);
    });
  });

  describe('DLQEntry Schema', () => {
    it('should validate a valid DLQ entry', () => {
      const validEntry = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        job_id: '550e8400-e29b-41d4-a716-446655440001',
        failure_reason: 'Timeout after 120 seconds',
        failure_code: 'TIMEOUT',
        status: 'pending',
        attempt_count: 1,
        created_at: '2024-12-12T10:00:00Z',
      };

      const isValid = validators.dlqEntry(validEntry);
      expect(isValid).toBe(true);
      if (!isValid) console.log(validators.dlqEntry.errors);
    });

    it('should reject DLQ entry with invalid status', () => {
      const invalidEntry = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        job_id: '550e8400-e29b-41d4-a716-446655440001',
        failure_reason: 'Test',
        status: 'invalid', // Invalid
      };

      const isValid = validators.dlqEntry(invalidEntry);
      expect(isValid).toBe(false);
    });
  });

  describe('QCResult Schema', () => {
    it('should validate a valid QC result', () => {
      const validResult = {
        overallStatus: 'passed',
        score: 85,
        issues: [
          {
            type: 'audio_level',
            severity: 'warning',
            message: 'Audio level slightly low at timestamp 30s',
            timestamp: 30,
          },
        ],
      };

      const isValid = validators.qcResult(validResult);
      expect(isValid).toBe(true);
    });

    it('should reject QC result with invalid severity', () => {
      const invalidResult = {
        overallStatus: 'passed',
        issues: [
          {
            type: 'test',
            severity: 'high', // Invalid - should be critical/warning/info
          },
        ],
      };

      const isValid = validators.qcResult(invalidResult);
      expect(isValid).toBe(false);
    });
  });
});

describe('Contract Backward Compatibility', () => {
  it('should accept responses with extra fields (forward compatible)', () => {
    const responseWithExtra = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'running',
      progress: 45,
      new_field: 'this is a new field not in schema', // Extra field
    };

    // By default, AJV allows additional properties
    const isValid = validators.qcJob(responseWithExtra);
    expect(isValid).toBe(true);
  });
});
