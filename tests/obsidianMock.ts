export function request(_options: { url: string }): Promise<string> {
	return Promise.reject(new Error('obsidian.request is not available in tests'));
}
