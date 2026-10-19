import assert from "node:assert/strict";
import test from "node:test";
import { auditRenderedLinks, probeExternal, sourceLinks } from "./check-links.mjs";
const wrap = links => `<main class="custom-md">${links}</main>`;
test("真实章节、跨页锚点、编码名称与文件附件有效，缺页和错误大小写锚点失败",async()=>{
	const pages=[{url:"https://blog.test/a/",html:wrap('<h2 id="中文">Title</h2><a href="#%E4%B8%AD%E6%96%87">self</a><a href="../b/#chapter">next</a><a href="/file.pdf#page=2">PDF</a><a href="#missing">bad</a><a href="/missing/">missing</a><a href="/b/#Chapter">case</a><a href="mailto:me@example.org">mail</a>')},{url:"https://blog.test/b/",html:wrap('<h2 id="chapter">Title</h2>')}];
	let calls=0;const result=await auditRenderedLinks(pages,async target=>{calls++;return {status:target.pathname==="/file.pdf"?200:404,type:"application/pdf",html:""};});
	assert.equal(result.issues.length,3);assert.equal(calls,2);assert.equal(result.links,6);
});
test("代码示例不是实际链接，外链不作为站内目标读取，非法协议失败",async()=>{
	const result=await auditRenderedLinks([{url:"https://blog.test/a/",html:wrap('<code>&lt;a href="/missing/"&gt;</code><a href="https://other.test/x#part">external</a><a href="javascript:alert(1)">unsafe</a>')}],()=>{throw new Error("Must not load external pages");});
	assert.deepEqual(result.external,["https://other.test/x"]);assert.equal(result.issues.length,1);
	assert.equal(sourceLinks([{file:"a.md",offset:4,tree:{type:"code",value:"[fake](https://fake.test)"}}]).length,0);
	assert.equal(sourceLinks([{file:"a.md",offset:4,tree:{type:"text",value:"Watch https://example.org/video/."}}])[0].url,"https://example.org/video/");
	assert.equal(sourceLinks([{file:"a.md",offset:4,tree:{type:"text",value:"Edit wB.Name in the example"}}]).length,0);
});
test("外链用 GET 复核 HEAD 失败，区分失效、访问受限和网络不确定，不下载完整响应",async()=>{
	for(const[status,classification]of[[404,"missing"],[410,"missing"],[403,"restricted"],[429,"restricted"],[503,"transient"],[200,"ok"]]){
		const methods=[];const result=await probeExternal("https://example.org",async(_,options)=>{methods.push(options.method);return new Response("sample",{status});});
		assert.equal(result.classification,classification);assert.equal(methods.length,status===200?1:2);
	}
	assert.equal((await probeExternal("https://example.org",()=>{throw new Error("DNS unavailable");})).classification,"transient");
});
