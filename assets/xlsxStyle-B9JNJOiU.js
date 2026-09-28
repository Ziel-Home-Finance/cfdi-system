const y=new TextEncoder;async function k(s){const t=new CompressionStream("deflate-raw"),r=t.writable.getWriter();r.write(s),r.close();const a=t.readable.getReader(),e=[];for(;;){const{done:i,value:m}=await a.read();if(i)break;e.push(m)}const c=e.reduce((i,m)=>i+m.length,0),o=new Uint8Array(c);let n=0;for(const i of e)o.set(i,n),n+=i.length;return o}function U(s){const t=s||new Date;return t.getFullYear()-1980<<25|t.getMonth()+1<<21|t.getDate()<<16|t.getHours()<<11|t.getMinutes()<<5|Math.floor(t.getSeconds()/2)}function T(s,t,r,a){const e=y.encode(s),c=new ArrayBuffer(30+e.length),o=new DataView(c);o.setUint32(0,67324752,!0),o.setUint16(4,20,!0),o.setUint16(6,2048,!0),o.setUint16(8,8,!0),o.setUint32(10,U(new Date),!0),o.setUint32(14,t,!0),o.setUint32(18,a,!0),o.setUint32(22,r,!0),o.setUint16(26,e.length,!0),o.setUint16(28,0,!0);const n=new Uint8Array(c);return n.set(e,30),n}function v(s,t,r,a,e){const c=y.encode(s),o=new ArrayBuffer(46+c.length),n=new DataView(o);n.setUint32(0,33639248,!0),n.setUint16(4,20,!0),n.setUint16(6,20,!0),n.setUint16(8,2048,!0),n.setUint16(10,8,!0),n.setUint32(12,U(new Date),!0),n.setUint32(16,t,!0),n.setUint32(20,a,!0),n.setUint32(24,r,!0),n.setUint16(28,c.length,!0),n.setUint16(30,0,!0),n.setUint16(32,0,!0),n.setUint16(34,0,!0),n.setUint16(36,0,!0),n.setUint32(38,0,!0),n.setUint32(42,e,!0);const i=new Uint8Array(o);return i.set(c,46),i}function I(){const s=new Int32Array(256);for(let t=0;t<256;t++){let r=t;for(let a=0;a<8;a++)r=r&1?r>>>1^3988292384:r>>>1;s[t]=r}return s}const D=I();function R(s){let t=4294967295;for(let r=0;r<s.length;r++)t=D[(t^s[r])&255]^t>>>8;return(t^4294967295)>>>0}function g(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function C(){return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2">
  <font><name val="Times New Roman"/><sz val="10"/><b/></font>
  <font><name val="Times New Roman"/><sz val="10"/></font>
</fonts>
<fills count="3">
  <fill><patternFill patternType="none"/></fill>
  <fill><patternFill patternType="gray125"/></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/></patternFill></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2">
  <xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
  <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
</styleSheet>`}function S(s,t){const r=s.length;t.length+1;let a=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols>`;for(let e=0;e<r;e++){const c=Math.min(50,Math.max(s[e].length*2,6)+4);a+=`<col min="${e+1}" max="${e+1}" width="${c}" customWidth="1"/>`}a+="</cols><sheetData>",a+='<row r="1">';for(let e=0;e<r;e++){const c=String.fromCharCode(65+(e<26?e:(e-26)%26+65));a+=`<c r="${c}1" s="0" t="inlineStr"><is><t>${g(s[e])}</t></is></c>`}a+="</row>";for(let e=0;e<t.length;e++){const c=e+2;a+=`<row r="${c}">`;for(let o=0;o<r;o++){const n=t[e][o],m=String.fromCharCode(65+(o<26?o:(o-26)%26+65))+c;n==null||n===""?a+=`<c r="${m}" s="1"/>`:typeof n=="number"?a+=`<c r="${m}" s="1"><v>${n}</v></c>`:a+=`<c r="${m}" s="1" t="inlineStr"><is><t>${g(String(n))}</t></is></c>`}a+="</row>"}return a+="</sheetData></worksheet>",a}function X(s){return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${g(s)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`}function $(){return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`}function A(){return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`}function B(){return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`}function p(s,t){const r=y.encode(t);return{name:s,data:r,size:r.length,compressed:null,crc:null,offset:0}}async function z(s,t,r,a){const e=[p("[Content_Types].xml",A()),p("_rels/.rels",B()),p("xl/workbook.xml",X(a)),p("xl/_rels/workbook.xml.rels",$()),p("xl/worksheets/sheet1.xml",S(s,t)),p("xl/styles.xml",C())];for(const l of e){const f=await k(l.data);l.compressed=f,l.crc=R(l.data)}let c=0;const o=[];for(const l of e){l.offset=c;const f=T(l.name,l.crc,l.size,l.compressed.length);o.push(f),o.push(l.compressed),c+=f.length+l.compressed.length}const n=[];let i=c;for(const l of e){const f=v(l.name,l.crc,l.size,l.compressed.length,l.offset);n.push(f),i+=f.length}const m=new ArrayBuffer(22),u=new DataView(m);u.setUint32(0,101010256,!0),u.setUint16(8,e.length,!0),u.setUint16(10,e.length,!0),u.setUint32(12,i-c,!0),u.setUint32(16,c,!0);const F=c+i-c+22,x=new Uint8Array(F);let d=0;for(const l of o)x.set(l,d),d+=l.length;for(const l of n)x.set(l,d),d+=l.length;x.set(new Uint8Array(m),d);const b=new Blob([x],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),w=URL.createObjectURL(b),h=document.createElement("a");h.href=w,h.download=r,document.body.appendChild(h),h.click(),document.body.removeChild(h),URL.revokeObjectURL(w)}export{z as writeStyledXlsx};
