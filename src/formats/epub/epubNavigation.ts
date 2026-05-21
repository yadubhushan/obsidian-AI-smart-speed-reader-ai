export interface NavEntry {
	label: string;
	href: string;
}

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

function collectNavAnchors(root: ParentNode, baseDir: string, out: NavEntry[]): void {
	for (const anchor of root.querySelectorAll('a[href]')) {
		const href = anchor.getAttribute('href');
		if (!href || href.startsWith('#')) {
			continue;
		}
		const label = anchor.textContent?.trim() ?? '';
		if (!label) {
			continue;
		}
		out.push({
			label,
			href: resolveRelative(baseDir, stripFragment(href))
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

function collectNcxNavPoints(parent: Element, baseDir: string, out: NavEntry[]): void {
	for (const point of parent.querySelectorAll(':scope > navPoint')) {
		const label =
			point.querySelector(':scope > navLabel > text')?.textContent?.trim() ??
			point.querySelector(':scope > navLabel')?.textContent?.trim() ??
			'';
		const src = point.querySelector(':scope > content')?.getAttribute('src');
		if (label && src) {
			out.push({
				label,
				href: resolveRelative(baseDir, stripFragment(src))
			});
		}
		collectNcxNavPoints(point, baseDir, out);
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

/**
 * Map navigation labels onto spine indices. When multiple entries hit the same spine
 * file, keep the longest label.
 */
export function mapNavEntriesToSpine(
	entries: NavEntry[],
	spinePaths: string[]
): Map<number, string> {
	const result = new Map<number, string>();
	for (const entry of entries) {
		const index = spineIndexForHref(entry.href, spinePaths);
		if (index === undefined) {
			continue;
		}
		const existing = result.get(index);
		if (!existing || entry.label.length > existing.length) {
			result.set(index, entry.label);
		}
	}
	return result;
}

export async function loadNavigationTitles(
	zip: { file(path: string): { async(type: 'text'): Promise<string> } | null },
	opfDir: string,
	navHref: string | undefined,
	ncxHref: string | undefined,
	spinePaths: string[]
): Promise<Map<number, string>> {
	if (navHref) {
		const navPath = resolveRelative(opfDir, navHref);
		const navXml = await zip.file(navPath)?.async('text');
		if (navXml) {
			const entries = parseNavDocument(navXml, navPath, opfDir);
			const mapped = mapNavEntriesToSpine(entries, spinePaths);
			if (mapped.size > 0) {
				return mapped;
			}
		}
	}

	if (ncxHref) {
		const ncxPath = resolveRelative(opfDir, ncxHref);
		const ncxXml = await zip.file(ncxPath)?.async('text');
		if (ncxXml) {
			const entries = parseNcxDocument(ncxXml, ncxPath, opfDir);
			return mapNavEntriesToSpine(entries, spinePaths);
		}
	}

	return new Map();
}
