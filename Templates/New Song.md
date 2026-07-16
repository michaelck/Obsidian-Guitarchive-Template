<%*
const songName = await tp.system.prompt("Song title?");
if (songName) await tp.file.rename(songName);
-%>
---
Artist: 
Song: <% songName %>
Album: 
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