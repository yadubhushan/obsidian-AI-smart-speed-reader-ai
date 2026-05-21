import { describe, expect, it, beforeEach } from 'vitest';
import {
	MOBILE_COACH_MARKS_KEY,
	markCoachMarksComplete,
	shouldShowCoachMarks
} from '../src/ui/readerShell/mobileCoachMarks';

class MemoryStorage implements Storage {
	private store = new Map<string, string>();

	get length(): number {
		return this.store.size;
	}

	clear(): void {
		this.store.clear();
	}

	getItem(key: string): string | null {
		return this.store.get(key) ?? null;
	}

	key(index: number): string | null {
		return [...this.store.keys()][index] ?? null;
	}

	removeItem(key: string): void {
		this.store.delete(key);
	}

	setItem(key: string, value: string): void {
		this.store.set(key, value);
	}
}

describe('mobileCoachMarks storage gate', () => {
	let storage: MemoryStorage;

	beforeEach(() => {
		storage = new MemoryStorage();
	});

	it('shows coach marks when key is absent', () => {
		expect(shouldShowCoachMarks(storage)).toBe(true);
	});

	it('hides coach marks after completion', () => {
		markCoachMarksComplete(storage);
		expect(storage.getItem(MOBILE_COACH_MARKS_KEY)).toBe('1');
		expect(shouldShowCoachMarks(storage)).toBe(false);
	});
});
