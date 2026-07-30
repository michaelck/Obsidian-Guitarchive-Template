---
cssclasses:
  - wide-page
---

```datacorejsx
const { Guitarchive } = await dc.require(dc.fileLink("Templates/Scripts/guitarchive-view.jsx"));
return function View() {
    return <Guitarchive dc={dc} />;
}
```
