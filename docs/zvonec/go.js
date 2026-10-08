// The main address opens Zvonec. Query (?paleta=…) and hash (#pozvanka/…, #setkani/…) travel along, so shared links
// keep working.
location.replace(`one/${location.search}${location.hash}`);
