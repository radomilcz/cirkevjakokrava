// Zvonec used to live at /one/; it now opens at the main address. Old bookmarks and links that were shared (#pozvanka/…,
// #setkani/…, ?paleta=…) land on the same screen there.
location.replace(`../${location.search}${location.hash}`);
