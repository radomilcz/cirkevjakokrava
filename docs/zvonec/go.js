// The main address opens Zvonec Next; the previous version stays at stara.html.
// Query (?paleta=…) and hash (#pozvanka/…, #setkani/…) travel along, so shared links keep working.
location.replace(`next/${location.search}${location.hash}`);
