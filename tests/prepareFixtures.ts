import { parseSegments } from '../src/parse/segmentParser';
import { normalizeDocument } from '../src/parse/normalizeSegments';
import type { NormalizedDocumentBundle } from '../src/parse/normalizeTypes';
import type { ProcessedDocument, ProcessorDeps } from '../src/types/processedDocument';
import type { LlmClient } from '../src/llm/CursorCliClient';
import { DEFAULT_SETTINGS } from '../src/types';
import { loadPreparePromptSetFromDirSync } from '../src/llm/promptCatalogSync';
import { join } from 'node:path';

const TEST_PREPARE_PROMPTS = loadPreparePromptSetFromDirSync(
	join(process.cwd(), 'config', 'prompts')
);

export const TEST_CHECKSUM = 'test-checksum-stub';
export const TEST_SOURCE_PATH = 'docs/overview.md';

export const OVERVIEW_EXCERPT = `---
title: Cloud Overview
tags: [interview]
---

## AWS vs GCP

Comparison of major cloud providers for interview prep.

| Service | AWS | GCP |
| --- | --- | --- |
| Compute | EC2 | Compute Engine |
| Storage | S3 | Cloud Storage |

> [!note] Key insight
> EC2 and Compute Engine are the primary VM offerings.

## Networking

See [[VPC Guide|VPC networking]] and [AWS docs](https://aws.amazon.com).

![Architecture diagram](architecture.png)

![[network-topology]]
`;

export function overviewBundle(): NormalizedDocumentBundle {
	const parsed = parseSegments(OVERVIEW_EXCERPT);
	return normalizeDocument(parsed, TEST_SOURCE_PATH, TEST_CHECKSUM);
}

export function mockLlmClient(responses: string[]): LlmClient {
	let calls = 0;
	return {
		complete: async () => {
			const idx = calls++;
			const response = responses[idx];
			if (response === undefined) {
				throw new Error(`Unexpected LLM call #${idx + 1}`);
			}
			return response;
		}
	};
}

export function defaultProcessorDeps(llm: LlmClient, overrides?: Partial<ProcessorDeps['settings']>): ProcessorDeps {
	return {
		llm,
		prompts: TEST_PREPARE_PROMPTS,
		settings: {
			prepareSingleCallMaxChars: DEFAULT_SETTINGS.ai.prepareSingleCallMaxChars,
			prepareSingleCallMaxLines: DEFAULT_SETTINGS.ai.prepareSingleCallMaxLines,
			llmModel: DEFAULT_SETTINGS.ai.llmModel,
			...overrides
		}
	};
}

export function sectionsLlmResponse(): string {
	return JSON.stringify({
		sections: [
			{
				title: 'AWS vs GCP',
				body: 'Cloud providers compared.'
			},
			{
				title: 'Networking',
				body: 'VPC networking essentials.'
			}
		]
	});
}

export function storyLlmResponse(): string {
	return JSON.stringify({
		body: 'Cloud providers compared.\n\nNetworking follows.'
	});
}

export function sampleSectionsProcessed(): ProcessedDocument {
	return {
		kind: 'sections',
		processorId: 'sections',
		meta: {
			sourcePath: TEST_SOURCE_PATH,
			sourceChecksum: TEST_CHECKSUM,
			processedAt: '2026-05-19T12:00:00.000Z',
			model: 'composer-2.5-fast',
			prepareStrategy: 'single'
		},
		sections: [
			{
				sectionId: '01-aws-vs-gcp',
				title: 'AWS vs GCP',
				stream: [{ kind: 'word', text: 'Compare' }]
			},
			{
				sectionId: '02-networking',
				title: 'Networking',
				stream: [{ kind: 'word', text: 'VPC' }]
			}
		]
	};
}

export function sampleStoryProcessed(): ProcessedDocument {
	return {
		kind: 'single_story',
		processorId: 'single_story',
		meta: {
			sourcePath: TEST_SOURCE_PATH,
			sourceChecksum: TEST_CHECKSUM,
			processedAt: '2026-05-19T12:00:00.000Z',
			model: 'composer-2.5-fast',
			prepareStrategy: 'single'
		},
		stream: [
			{ kind: 'word', text: 'One' },
			{ kind: 'word', text: 'story.' }
		]
	};
}

export function oversizedBundle(base: NormalizedDocumentBundle): NormalizedDocumentBundle {
	return {
		...base,
		estimatedPayloadChars: 999_999,
		estimatedPayloadLines: 99_999
	};
}
