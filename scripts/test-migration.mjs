import assert from "node:assert/strict";
import test from "node:test";
import { auditContent, projectRoot } from "./check-content.mjs";
import { bodyFingerprint, createMigrationPlan, proposedImageName, verifyMigration } from "./check-migration.mjs";

const target="src/content/posts/migration-verification-fixture/index.md";
const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="red"/></svg>');
const source=(body,metadata="")=>`---\ntitle: Migration fixture\npublished: 2026-10-19\ndescription: Original draft\n${metadata}\n---\n${body}`;
const context={documents:[],permalink:{enable:false},staticRoutes:[],protectedFiles:[]};
const planFor=(draft,extra={})=>createMigrationPlan({source:draft,sourcePath:projectRoot+"draft.md",target,context,readAsset:async()=>svg,...extra});
async function parsed(draft){return(await auditContent({documents:[{file:target,source:draft}],inspectFile:async()=>"ok"})).articles;}
test("预检给默认名称提出语义命名，保留图片宽度、标题、公式和代码，验证只接受对应图片映射",async()=>{
	const original=source('![Timing diagram w-500px](PixPin-2026.svg "caption")\n\nText $a+b$ and `![code](fake.svg)`.\n\n```js\nconst text="unchanged";\n```');
	const plan=await planFor(original);assert.equal(plan.assets.length,1);assert.equal(plan.references[0].targetReference,"index.assets/timing-diagram.svg");
	const migrated=original.replace("(PixPin-2026.svg", "(index.assets/timing-diagram.svg");
	const result=await verifyMigration(plan,{articles:await parsed(migrated),read:async()=>svg});assert.equal(result.references,1);
	await assert.rejects(verifyMigration(plan,{articles:await parsed(migrated.replace("a+b","a-b")),read:async()=>svg}),/prose, formulas, code/);
	await assert.rejects(verifyMigration(plan,{articles:await parsed(migrated.replace('text="unchanged"','text="changed"')),read:async()=>svg}),/prose, formulas, code/);
	await assert.rejects(verifyMigration(plan,{articles:await parsed(migrated.replace("Timing diagram","Other caption")),read:async()=>svg}),/prose, formulas, code/);
});
test("丢图、图片内容被替换、引用顺序改变和元数据改变都会失败",async()=>{
	const plan=await planFor(source('![One](one.svg)\n\n![Two](two.svg)'));
	const valid=source('![One](index.assets/one.svg)\n\n![Two](index.assets/two.svg)');
	await assert.rejects(verifyMigration(plan,{articles:await parsed(valid),read:async()=>Buffer.from("wrong image")}),/Image bytes changed/);
	await assert.rejects(verifyMigration(plan,{articles:await parsed(valid.replace("two.svg","missing.svg")),read:async()=>svg}),/order or mapping/);
	await assert.rejects(verifyMigration(plan,{articles:await parsed(valid.replace("Original draft","Changed description")),read:async()=>svg}),/Metadata/);
	await assert.rejects(verifyMigration(plan,{articles:await parsed(valid.replace('![Two](index.assets/two.svg)',"")),read:async()=>svg}),/prose|count/);
});
test("同名图片不覆盖，重复引用复用原映射，显式映射冲突和越界目录拒绝",async()=>{
	const plan=await planFor(source('![Same](a/PixPin-1.svg)\n\n![Same](b/PixPin-2.svg)\n\n![Again](a/PixPin-1.svg)'));
	assert.deepEqual(plan.references.map(ref=>ref.targetReference),["index.assets/same.svg","index.assets/same-2.svg","index.assets/same.svg"]);
	assert.equal(plan.assets.length,2);
	await assert.rejects(planFor(source('![One](one.svg)'),{map:{"one.svg":"../../escape.svg"}}),/Invalid planned/);
	await assert.rejects(planFor(source('![A](a.svg)\n\n![B](b.svg)'),{map:{"a.svg":"index.assets/same.svg","b.svg":"index.assets/same.svg"}}),/mapping collides/);
	await assert.rejects(planFor(source("text"),{target:"../escape/index.md"}),/Target must/);
	await assert.rejects(planFor(source("text"),{target:"src/content/posts/../index.md"}),/Invalid article directory/);
	await assert.rejects(planFor(source('![Bad extension](one.png)')),/extension differs/);
	assert.equal(proposedImageName("CON.svg","",0),"image-con.svg");
});
test("引用式图片路径调整不改变正文指纹，代码示例不进入图片清单",async()=>{
	const draft=source('![Plot][plot]\n\n[plot]: PixPin-1.svg "title"\n\n```md\n![fake](missing.svg)\n```');
	const plan=await planFor(draft);assert.equal(plan.assets.length,1);
	const migrated=draft.replace("[plot]: PixPin-1.svg","[plot]: index.assets/plot.svg");
	assert.equal(bodyFingerprint((await parsed(draft))[0].tree),bodyFingerprint((await parsed(migrated))[0].tree));
	await verifyMigration(plan,{articles:await parsed(migrated),read:async()=>svg});
});
test("元数据、评论标识和旧文章保护阻止迁移波及其他文章",async()=>{
	const existing={file:target,source:source("old","permalink: Old")};
	await assert.rejects(planFor(source("new"),{context:{...context,documents:[existing]}}),/Target article exists/);
	await assert.rejects(planFor(source("new","permalink: New"),{context:{...context,documents:[existing]},allowExisting:true}),/comment identity/);
	const plan=await planFor(source("same"));plan.protectedFiles=[{file:"src/content/posts/existing.md",hash:"must remain unchanged"}];
	await assert.rejects(verifyMigration(plan,{articles:await parsed(source("same")),read:async()=>svg}),/Existing content changed/);
});
