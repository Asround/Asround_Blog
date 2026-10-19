import assert from "node:assert/strict";
import http from "node:http";
import { chromium } from "playwright-core";
import { waitForReadingReady } from "./check-performance.mjs";

const server=http.createServer((request,response)=>{
	if(request.url==="/")response.writeHead(200,{"content-type":"text/html"}).end('<img src="/ok.svg" width="20" height="20"><img data-banner-src="/later.svg" width="20" height="20"><div id="hidden" style="opacity:0"><img src="/missing.svg" width="20" height="20"></div>');
	else if(request.url==="/ok.svg")response.writeHead(200,{"content-type":"image/svg+xml"}).end('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>');
	else response.writeHead(404).end();
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
let browser;
try{
	browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||"msedge",headless:true});
	const page=await browser.newPage();
	await page.addInitScript(()=>{window.lab={};});
	await page.goto(`http://127.0.0.1:${server.address().port}/`);
	await page.evaluate(waitForReadingReady);
	assert.ok(await page.evaluate(()=>window.lab.ready>=window.lab.textReady));
	await page.locator("#hidden").evaluate(element=>{element.style.opacity="1";});
	await assert.rejects(page.evaluate(waitForReadingReady),/Visible first-party image failed/);
	console.log("PASS performance readiness: deferred and transparent frames skipped; a visible broken image still fails");
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
