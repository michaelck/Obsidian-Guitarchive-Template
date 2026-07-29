<%*
const songName = await tp.system.prompt("Song title?");
if (songName) await tp.file.rename(songName);
-%>
---
Artist: 
Song: <% songName %>
Album: 
Version: 
Tuning: Standard
Capo: 
Key: 
Favorite: false
Cover: 
Originally Tabbed By: 
Tab Source: 
cssclasses:
  - song-note

---

```datacorejsx
const { SongHeader } = await dc.require(dc.fileLink("Templates/Scripts/song-header-view.jsx"));
return function View() {
    return <SongHeader dc={dc} />;
}
```
