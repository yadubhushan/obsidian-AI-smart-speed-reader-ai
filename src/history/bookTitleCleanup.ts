/** Display-title cleanup for library rows. Never touches files or stored state. */

export interface CleanedBookName {
	title: string;
	author?: string;
}

export interface SplitBookTitle {
	main: string;
	subtitle?: string;
}

const SHADOW_LIBRARY_DOMAIN = String.raw`(?:z-library|z-lib|1lib|libgen|annas-archive)\.[a-z]{2,}`;
const SHADOW_LIBRARY_PAREN_RE = new RegExp(String.raw`\([^()]*${SHADOW_LIBRARY_DOMAIN}[^()]*\)?`, 'gi');
const SHADOW_LIBRARY_BARE_RE = new RegExp(String.raw`${SHADOW_LIBRARY_DOMAIN}[\s,]*`, 'gi');
const ETC_PAREN_RE = /\(\s*(?:etc\.?|\.\.\.)?\s*\)/gi;
const NAME_TOKEN = String.raw`(?:[A-Z][\p{L}'’.-]*|[A-Z]\.)`;
const AUTHOR_NAME = String.raw`${NAME_TOKEN}(?:\s+${NAME_TOKEN}){1,3}`;
const TRAILING_BY_AUTHOR_RE = new RegExp(String.raw`^(.+?)\s+by\s+(${AUTHOR_NAME})$`, 'u');
const TRAILING_PAREN_AUTHOR_RE = new RegExp(String.raw`^(.+?)\s*\((${AUTHOR_NAME})\)?$`, 'u');

function collapseWhitespace(value: string): string {
	return value.replace(/[_\s]+/g, ' ').trim();
}

function trimSeparators(value: string): string {
	return value.replace(/^[\s\-–—,.:;]+|[\s\-–—,.:;]+$/g, '');
}

function removeUnbalancedParens(value: string): string {
	let depth = 0;
	let out = '';
	for (const char of value) {
		if (char === '(') {
			depth += 1;
		} else if (char === ')') {
			if (depth === 0) {
				continue;
			}
			depth -= 1;
		}
		out += char;
	}
	return out;
}

/** Strip download-site noise from any title (metadata or filename). */
export function stripTitleJunk(raw: string): string {
	const cleaned = raw
		.replace(SHADOW_LIBRARY_PAREN_RE, ' ')
		.replace(SHADOW_LIBRARY_BARE_RE, ' ')
		.replace(ETC_PAREN_RE, ' ');
	const result = trimSeparators(collapseWhitespace(cleaned));
	return result || raw.trim();
}

/** Turn an EPUB basename into a readable title, pulling a trailing author out when obvious. */
export function cleanBookFilename(basename: string): CleanedBookName {
	const withoutExt = basename.replace(/\.epub$/i, '');
	const base = stripTitleJunk(withoutExt);

	const byMatch = TRAILING_BY_AUTHOR_RE.exec(base);
	if (byMatch?.[1] && byMatch[2]) {
		return {
			title: trimSeparators(removeUnbalancedParens(byMatch[1])),
			author: byMatch[2]
		};
	}

	const parenMatch = TRAILING_PAREN_AUTHOR_RE.exec(base);
	if (parenMatch?.[1] && parenMatch[2]) {
		return {
			title: trimSeparators(removeUnbalancedParens(parenMatch[1])),
			author: parenMatch[2]
		};
	}

	const title = trimSeparators(collapseWhitespace(removeUnbalancedParens(base)));
	return { title: title || withoutExt };
}

/** Split "Main: Subtitle" so tiles can show the short form and keep the rest for tooltips. */
export function splitBookTitle(title: string): SplitBookTitle {
	const match = /^(.{2,}?)\s*:\s+(.+)$/.exec(title.trim());
	if (!match?.[1] || !match[2]) {
		return { main: title.trim() };
	}
	return { main: match[1], subtitle: match[2] };
}

/** Key used to collapse duplicate copies of the same book. */
export function bookDedupeKey(title: string): string {
	const { main } = splitBookTitle(title);
	return main
		.toLowerCase()
		.replace(/^the\s+/, '')
		.replace(/[^\p{L}\p{N}]+/gu, '');
}
