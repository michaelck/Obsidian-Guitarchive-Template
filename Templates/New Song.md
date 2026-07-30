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

<!-- Archiving something MusicBrainz/Wikipedia won't have — your own songs,
     a friend's band, a local artist with no official release? Add
     "Metadata Source: none" above. Enrich Song will still build the header
     below from whatever you fill in here, it just skips the lookup. (Set
     the same property on the artist's own page to skip its enrichment too
     — it's independent, not inherited from this note.) -->

```datacorejsx
const { SongHeader } = await dc.require(dc.fileLink("Templates/Scripts/song-header-view.jsx"));
return function View() {
    return <SongHeader dc={dc} />;
}
```
