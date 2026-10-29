import { cleanTitleText, elementTitleText } from './epubTitleResolution';

export interface NavEntry {
	label: string;
	href: string;
	/** Anchor id inside `href` (without `#`), when the TOC points mid-file. */
	fragment?: string;
	/** Nesting level in the TOC (0 = top level). */
	depth?: number;
}

/** A TOC entry that starts a new chapter partway through one spine file. */
export interface NavSplitPoint {
	label: string;
	fragment: string;
}

/** How one spine file divides into chapters. */
export interface NavSpineSplit {
	points: NavSplitPoint[];
	/** Label of a TOC entry pointing at the file itself; names any text before `points[0]`. */
	leadInLabel?: string;
}

/** Numbered sub-sections ("2", "IV.") sit inside a chapter; they never start one. */
const BARE_NUMBER_LABEL_RE = /^[\divxlcdm]+\.?$/i;

export interface OpfManifestInfo {
	title: string;
	author?: string;
	spineHrefs: string[];
	coverHref?: string;
	navHref?: string;
	ncxHref?: string;
}

export function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function resolveRelative(baseDir: string, href: string): string {
	const baseParts = normalizePath(baseDir).split('/').filter(Boolean);
	const hrefParts = normalizePath(href.split('#')[0] ?? href).split('/').filter(Boolean);
	for (const part of hrefParts) {
		if (part === '..') {
			baseParts.pop();
		} else if (part !== '.') {
			baseParts.push(part);
		}
	}
	return baseParts.join('/');
}

export function stripFragment(href: string): string {
	const hash = href.indexOf('#');
	return hash >= 0 ? href.slice(0, hash) : href;
}

export function fragmentOf(href: string): string | undefined {
	const hash = href.indexOf('#');
	if (hash < 0) {
		return undefined;
	}
	const raw = href.slice(hash + 1);
	if (!raw) {
		return undefined;
	}
	try {
		return decodeURIComponent(raw);
	} catch {
		return raw;
	}
}

/** Resolved spine content paths (relative to OPF directory). */
export function spineContentPaths(opfDir: string, spineHrefs: string[]): string[] {
	return spineHrefs.map((href) => resolveRelative(opfDir, href));
}

export function parseOpf(opfXml: string): OpfManifestInfo {
	const doc = new DOMParser().parseFromString(opfXml, 'application/xml');
	const title =
		doc.querySelector('metadata > dc\\:title, metadata > title')?.textContent?.trim() ??
		'Untitled';
	const author =
		doc.querySelector('metadata > dc\\:creator, metadata > creator')?.textContent?.trim() ??
		undefined;

	const manifest = new Map<string, { href: string; mediaType?: string; properties?: string }>();
	for (const item of doc.querySelectorAll('manifest > item')) {
		const id = item.getAttribute('id');
		const href = item.getAttribute('href');
		if (id && href) {
			manifest.set(id, {
				href,
				mediaType: item.getAttribute('media-type') ?? undefined,
				properties: item.getAttribute('properties') ?? undefined
			});
		}
	}

	let coverHref: string | undefined;
	const coverMeta = doc.querySelector('meta[name="cover"]');
	if (coverMeta) {
		const coverId = coverMeta.getAttribute('content');
		if (coverId) {
			coverHref = manifest.get(coverId)?.href;
		}
	}
	let navHref: string | undefined;
	let ncxHref: string | undefined;
	for (const entry of manifest.values()) {
		const props = entry.properties ?? '';
		if (!coverHref && props.includes('cover-image')) {
			coverHref = entry.href;
		}
		if (!navHref && props.split(/\s+/).includes('nav')) {
			navHref = entry.href;
		}
		if (!ncxHref && entry.mediaType === 'application/x-dtbncx+xml') {
			ncxHref = entry.href;
		}
	}

	const spineEl = doc.querySelector('spine');
	const spineTocId = spineEl?.getAttribute('toc');
	if (!ncxHref && spineTocId) {
		ncxHref = manifest.get(spineTocId)?.href;
	}

	const spineHrefs: string[] = [];
	for (const itemref of doc.querySelectorAll('spine > itemref')) {
		const idref = itemref.getAttribute('idref');
		if (!idref) continue;
		const href = manifest.get(idref)?.href;
		if (href) {
			spineHrefs.push(href);
		}
	}

	return { title, author, spineHrefs, coverHref, navHref, ncxHref };
}

function isTocNavElement(nav: Element): boolean {
	const epubType = nav.getAttributeNS('http://www.idpf.org/2007/ops', 'type') ?? nav.getAttribute('epub:type') ?? '';
	if (epubType.split(/\s+/).includes('toc')) {
		return true;
	}
	const role = nav.getAttribute('role') ?? '';
	return role === 'doc-toc';
}

function navAnchorDepth(anchor: Element, root: ParentNode): number {
	let depth = 0;
	for (let el = anchor.parentElement; el && el !== root; el = el.parentElement) {
		if (el.tagName === 'OL' || el.tagName === 'UL') {
			depth++;
		}
	}
	return Math.max(0, depth - 1);
}

function collectNavAnchors(root: ParentNode, baseDir: string, out: NavEntry[]): void {
	for (const anchor of root.querySelectorAll('a[href]')) {
		const href = anchor.getAttribute('href');
		if (!href || href.startsWith('#')) {
			continue;
		}
		const label = cleanTitleText(elementTitleText(anchor));
		if (!label) {
			continue;
		}
		out.push({
			label,
			href: resolveRelative(baseDir, stripFragment(href)),
			fragment: fragmentOf(href),
			depth: navAnchorDepth(anchor, root)
		});
	}
}

export function parseNavDocument(navXml: string, navPath: string, opfDir: string): NavEntry[] {
	const doc = new DOMParser().parseFromString(navXml, 'text/html');
	const navBaseDir = navPath.includes('/')
		? navPath.replace(/[/][^/]+$/, '')
		: opfDir;
	const entries: NavEntry[] = [];

	for (const nav of doc.querySelectorAll('nav')) {
		if (!isTocNavElement(nav)) {
			continue;
		}
		collectNavAnchors(nav, navBaseDir, entries);
	}

	if (entries.length === 0) {
		collectNavAnchors(doc.body ?? doc, navBaseDir, entries);
	}

	return entries;
}

function collectNcxNavPoints(
	parent: Element,
	baseDir: string,
	out: NavEntry[],
	depth = 0
): void {
	for (const point of parent.querySelectorAll(':scope > navPoint')) {
		const label = cleanTitleText(
			point.querySelector(':scope > navLabel > text')?.textContent ??
				point.querySelector(':scope > navLabel')?.textContent ??
				''
		);
		const src = point.querySelector(':scope > content')?.getAttribute('src');
		if (label && src) {
			out.push({
				label,
				href: resolveRelative(baseDir, stripFragment(src)),
				fragment: fragmentOf(src),
				depth
			});
		}
		collectNcxNavPoints(point, baseDir, out, depth + 1);
	}
}

export function parseNcxDocument(ncxXml: string, ncxPath: string, opfDir: string): NavEntry[] {
	const doc = new DOMParser().parseFromString(ncxXml, 'application/xml');
	const ncxBaseDir = ncxPath.includes('/') ? ncxPath.replace(/[/][^/]+$/, '') : opfDir;
	const entries: NavEntry[] = [];
	const navMap = doc.querySelector('navMap');
	if (navMap) {
		collectNcxNavPoints(navMap, ncxBaseDir, entries);
	}
	return entries;
}

function pathMatchesSpine(navPath: string, spinePath: string): boolean {
	if (navPath === spinePath) {
		return true;
	}
	const navBase = navPath.split('/').pop() ?? navPath;
	const spineBase = spinePath.split('/').pop() ?? spinePath;
	return navBase === spineBase;
}

function spineIndexForHref(
	targetPath: string,
	spinePaths: string[]
): number | undefined {
	for (let i = 0; i < spinePaths.length; i++) {
		const spinePath = spinePaths[i];
		if (spinePath && pathMatchesSpine(targetPath, spinePath)) {
			return i;
		}
	}
	return undefined;
}

/** Ranks entries that share a spine file: whole-file links, then shallower, then longer labels. */
function navEntryRank(entry: NavEntry): [number, number, number] {
	return [entry.fragment ? 1 : 0, entry.depth ?? 0, -entry.label.length];
}

function outranks(a: NavEntry, b: NavEntry): boolean {
	const ra = navEntryRank(a);
	const rb = navEntryRank(b);
	for (let i = 0; i < ra.length; i++) {
		if (ra[i] !== rb[i]) {
			return ra[i]! < rb[i]!;
		}
	}
	return false;
}

/**
 * Map navigation labels onto spine indices. When multiple entries hit the same spine
 * file, prefer one linking to the file itself (its heading) over anchors inside it, then
 * the shallowest TOC level, then the longest label.
 */
export function mapNavEntriesToSpine(
	entries: NavEntry[],
	spinePaths: string[]
): Map<number, string> {
	const best = new Map<number, NavEntry>();
	for (const entry of entries) {
		const index = spineIndexForHref(entry.href, spinePaths);
		if (index === undefined) {
			continue;
		}
		const existing = best.get(index);
		if (!existing || outranks(entry, existing)) {
			best.set(index, entry);
		}
	}
	return new Map([...best].map(([index, entry]) => [index, entry.label]));
}

/**
 * TOC entries that start chapters mid-file, grouped by spine index. Bare-number labels are
 * skipped and only the shallowest remaining TOC level counts, so sub-sections never split a
 * chapter; a file needs at least two distinct anchors to split.
 */
export function navSplitPointsBySpine(
	entries: NavEntry[],
	spinePaths: string[]
): Map<number, NavSpineSplit> {
	const bySpine = new Map<number, NavEntry[]>();
	for (const entry of entries) {
		const index = spineIndexForHref(entry.href, spinePaths);
		if (index === undefined) {
			continue;
		}
		const list = bySpine.get(index) ?? [];
		list.push(entry);
		bySpine.set(index, list);
	}

	const result = new Map<number, NavSpineSplit>();
	for (const [index, list] of bySpine) {
		const anchored = list.filter(
			(e) => e.fragment && !BARE_NUMBER_LABEL_RE.test(e.label.trim())
		);
		const minDepth = Math.min(...anchored.map((e) => e.depth ?? 0));
		const points: NavSplitPoint[] = [];
		const seen = new Set<string>();
		for (const entry of anchored) {
			if ((entry.depth ?? 0) !== minDepth || seen.has(entry.fragment!)) {
				continue;
			}
			seen.add(entry.fragment!);
			points.push({ label: entry.label, fragment: entry.fragment! });
		}
		if (points.length >= 2) {
			result.set(index, {
				points,
				leadInLabel: list.find((e) => !e.fragment)?.label
			});
		}
	}
	return result;
}

export async function loadNavigationEntries(
	zip: { file(path: string): { async(type: 'text'): Promise<string> } | null },
	opfDir: string,
	navHref: string | undefined,
	ncxHref: string | undefined,
	spinePaths: string[]
): Promise<NavEntry[]> {
	if (navHref) {
		const navPath = resolveRelative(opfDir, navHref);
		const navXml = await zip.file(navPath)?.async('text');
		if (navXml) {
			const entries = parseNavDocument(navXml, navPath, opfDir);
			if (mapNavEntriesToSpine(entries, spinePaths).size > 0) {
				return entries;
			}
		}
	}

	if (ncxHref) {
		const ncxPath = resolveRelative(opfDir, ncxHref);
		const ncxXml = await zip.file(ncxPath)?.async('text');
		if (ncxXml) {
			return parseNcxDocument(ncxXml, ncxPath, opfDir);
		}
	}

	return [];
}

export async function loadNavigationTitles(
	zip: { file(path: string): { async(type: 'text'): Promise<string> } | null },
	opfDir: string,
	navHref: string | undefined,
	ncxHref: string | undefined,
	spinePaths: string[]
): Promise<Map<number, string>> {
	const entries = await loadNavigationEntries(zip, opfDir, navHref, ncxHref, spinePaths);
	return mapNavEntriesToSpine(entries, spinePaths);
}
