// Finds a book's details and front cover from its ISBN (or title and author).
// Sources: Open Library covers and Google Books, both free and keyless.
(function () {
  const cleanIsbn = (s) => String(s || '').replace(/[^0-9Xx]/g, '').toUpperCase();

  function loads(url, timeout = 6000) {
    return new Promise((resolve) => {
      const img = new Image();
      const t = setTimeout(() => { img.src = ''; resolve(false); }, timeout);
      img.onload = () => { clearTimeout(t); resolve(img.naturalWidth > 40 && img.naturalHeight > 60); };
      img.onerror = () => { clearTimeout(t); resolve(false); };
      img.referrerPolicy = 'no-referrer';
      img.src = url;
    });
  }

  async function googleBooks(isbn, title, author) {
    const q = isbn ? 'isbn:' + isbn
      : [title && 'intitle:' + title, author && 'inauthor:' + author].filter(Boolean).join(' ');
    if (!q) return null;
    try {
      const r = await fetch('https://www.googleapis.com/books/v1/volumes?maxResults=5&q=' + encodeURIComponent(q));
      if (!r.ok) return null;
      const items = (await r.json()).items || [];
      const best = items.find((i) => i.volumeInfo && i.volumeInfo.imageLinks) || items[0];
      if (!best) return null;
      const v = best.volumeInfo || {};
      const ids = v.industryIdentifiers || [];
      const isbn13 = (ids.find((x) => x.type === 'ISBN_13') || ids.find((x) => x.type === 'ISBN_10') || {}).identifier;
      let thumb = v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail);
      const covers = [];
      if (thumb) {
        thumb = thumb.replace(/^http:/, 'https:').replace(/&edge=curl/, '');
        covers.push(thumb.replace(/&zoom=\d/, '') + '&fife=w600-h900', thumb);
      }
      return {
        title: v.title || null,
        author: (v.authors || []).join(', ') || null,
        publisher: v.publisher || null,
        isbn: isbn13 || null,
        covers,
      };
    } catch (e) {
      return null;
    }
  }

  /** Look a book up. Returns { title, author, publisher, isbn, cover } with whatever was found. */
  async function find({ isbn, title, author }) {
    isbn = cleanIsbn(isbn);
    const g = await googleBooks(isbn, title, author);
    const foundIsbn = isbn || (g && cleanIsbn(g.isbn));
    const candidates = [];
    if (foundIsbn) candidates.push('https://covers.openlibrary.org/b/isbn/' + foundIsbn + '-L.jpg?default=false');
    if (g) candidates.push(...g.covers);
    let cover = null;
    for (const url of candidates) {
      if (await loads(url)) { cover = url; break; }
    }
    return {
      title: g && g.title, author: g && g.author, publisher: g && g.publisher,
      isbn: foundIsbn || null, cover,
    };
  }

  window.Covers = { find, cleanIsbn };
})();
