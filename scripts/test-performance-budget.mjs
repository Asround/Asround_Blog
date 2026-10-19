import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { performanceBudgetAdvisories } from "./check-performance.mjs";
const row={route:"/",cache:"cold",decodedBytes:1000000,scriptBytes:100000,fontBytes:200000,imageBytes:600000,requests:50,cls:.02,readyMs:1000,lcpMs:700};
const baseline={rows:[row]};
test("体积、请求数和布局跳动回归必须失败，时间波动只提示",()=>{
	assert.deepEqual(performanceBudgetAdvisories([{...row,decodedBytes:1100000}],baseline),[]);
	for(const change of [{scriptBytes:250000},{requests:200},{cls:.4}])assert.throws(()=>performanceBudgetAdvisories([{...row,...change}],baseline));
	assert.equal(performanceBudgetAdvisories([{...row,readyMs:8000}],baseline).length,1);
	assert.throws(()=>performanceBudgetAdvisories([{...row,route:"/missing/"}],baseline),/Missing baseline/);
});
test("已记录的生产基线包含三个页面及冷、热缓存，各项资源数据有效",async()=>{
	const report=JSON.parse(await readFile("scripts/performance-baseline.json","utf8"));
	assert.equal(report.environment.samples,3);assert.equal(report.rows.length,6);
	assert.equal(new Set(report.rows.map(row=>row.route+row.cache)).size,6);
	for(const item of report.rows)assert.ok(item.decodedBytes>0 && item.requests>0 && item.fontBytes>0 && item.cls>=0);
	assert.deepEqual(performanceBudgetAdvisories(report.rows,report),[]);
});
