import JSZip from 'jszip';

export interface MinimalEpubChapter {
	id: string;
	href: string;
	title: string;
	body: string;
}

export interface EpubNavEntry {
	label: string;
	href: string;
}

export interface MinimalEpubOptions {
	title?: string;
	author?: string;
	chapters?: MinimalEpubChapter[];
	/** EPUB3 navigation document TOC entries (href relative to OEBPS/). */
	nav?: EpubNavEntry[];
	/** EPUB2 NCX entries (href relative to OEBPS/). */
	ncx?: EpubNavEntry[];
	/** Manifest href for cover image, e.g. Images/cover.jpg */
	coverHref?: string;
}

const DEFAULT_CHAPTERS: MinimalEpubChapter[] = [
	{
		id: 'ch1',
		href: 'text/chapter1.xhtml',
		title: 'First Chapter',
		body: '<html><head><title>First Chapter</title></head><body><p>Hello world from chapter one.</p></body></html>'
	},
	{
		id: 'ch2',
		href: 'text/chapter2.xhtml',
		title: 'Second Chapter',
		body: '<html><head><title>Second Chapter</title></head><body><p>Another chapter with more words here.</p></body></html>'
	}
];

const MINIMAL_JPEG = new Uint8Array([
	0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
	0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
	0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
	0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
	0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
	0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
	0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0xff, 0xc4, 0x00, 0x14, 0x10, 0x01,
	0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xda,
	0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x7f, 0x80, 0xff, 0xd9
]);

function buildNavXhtml(entries: EpubNavEntry[]): string {
	const items = entries
		.map((e) => `<li><a href="${e.href}">${e.label}</a></li>`)
		.join('\n');
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Navigation</title></head>
<body>
<nav epub:type="toc" id="toc">
  <ol>
    ${items}
  </ol>
</nav>
</body>
</html>`;
}

function buildNcx(entries: EpubNavEntry[]): string {
	const points = entries
		.map(
			(e, i) => `
    <navPoint id="np${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${e.label}</text></navLabel>
      <content src="${e.href}"/>
    </navPoint>`
		)
		.join('');
	return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>${points}
  </navMap>
</ncx>`;
}

export async function buildMinimalEpubBytes(options: MinimalEpubOptions = {}): Promise<ArrayBuffer> {
	const title = options.title ?? 'Sample Book';
	const author = options.author ?? 'Test Author';
	const chapters = options.chapters ?? DEFAULT_CHAPTERS;
	const zip = new JSZip();

	zip.file(
		'META-INF/container.xml',
		`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
	);

	const extraManifest: string[] = [];
	const spinePrefix: string[] = [];

	if (options.nav && options.nav.length > 0) {
		extraManifest.push(
			`<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`
		);
		zip.file('OEBPS/nav.xhtml', buildNavXhtml(options.nav));
	}

	let ncxId: string | undefined;
	if (options.ncx && options.ncx.length > 0) {
		ncxId = 'ncx';
		extraManifest.push(
			`<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`
		);
		zip.file('OEBPS/toc.ncx', buildNcx(options.ncx));
		spinePrefix.push(`toc="${ncxId}"`);
	}

	if (options.coverHref) {
		extraManifest.push(
			`<item id="cover-image" href="${options.coverHref}" media-type="image/jpeg" properties="cover-image"/>`
		);
		zip.file(`OEBPS/${options.coverHref}`, MINIMAL_JPEG);
	}

	const manifestItems = [
		...extraManifest,
		...chapters.map(
			(ch) =>
				`<item id="${ch.id}" href="${ch.href}" media-type="application/xhtml+xml"/>`
		)
	].join('\n    ');
	const spineItems = chapters.map((ch) => `<itemref idref="${ch.id}"/>`).join('\n    ');
	const spineAttrs = spinePrefix.length > 0 ? ` ${spinePrefix.join(' ')}` : '';

	zip.file(
		'OEBPS/content.opf',
		`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    <dc:identifier id="book-id">test-book</dc:identifier>
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine${spineAttrs}>
    ${spineItems}
  </spine>
</package>`
	);

	for (const chapter of chapters) {
		zip.file(`OEBPS/${chapter.href}`, chapter.body);
	}

	return zip.generateAsync({ type: 'arraybuffer' });
}

/** Chapters whose HTML &lt;title&gt; repeats the book title (common EPUB defect). */
export function chaptersWithRepeatedBookTitle(bookTitle: string, count = 3): MinimalEpubChapter[] {
	return Array.from({ length: count }, (_, i) => ({
		id: `ch${i + 1}`,
		href: `text/chapter${i + 1}.xhtml`,
		title: `ignored-${i + 1}`,
		body: `<html><head><title>${bookTitle}</title></head><body><p>Words in chapter number ${i + 1} here.</p></body></html>`
	}));
}
