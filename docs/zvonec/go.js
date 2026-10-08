// The main address opens Zvonec One; the previous app stays at stara.html. The retired Next and Simple (next/,
// simple/) are only this redirect now, so old bookmarks and invitation links land in One, whose routes understand
// their slugs. Query (?paleta=…) and hash (#pozvanka/…, #setkani/…) travel along.
const retired = /\/(?:next|simple)\/(?:index\.html)?$/.test(location.pathname);
location.replace(`${retired ? '../' : ''}one/${location.search}${location.hash}`);
