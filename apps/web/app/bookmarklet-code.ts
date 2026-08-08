export function bookmarkletCode(origin: string): string {
    const destination = `${origin}/bookmarklet`;
    return `javascript:(()=>{const u=encodeURIComponent(location.href),t=encodeURIComponent(document.title),d=encodeURIComponent(String(window.getSelection()||''));const w=window.open('${destination}?url='+u+'&title='+t+'&description='+d+'&source=bookmarklet','gongyu');if(w)w.focus()})()`;
}
