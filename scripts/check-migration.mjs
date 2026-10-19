import assert from "node:assert/strict";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { auditContent, auditProject, readDocuments, readPermalinkConfig, readStaticRoutes, listFiles, projectRoot, commentTermForArticle, createFileInspector } from "./check-content.mjs";
import { hash, imageReferences } from "./check-image-integrity.mjs";

function stable(value) {
	if (value instanceof Date) return value.toISOString();
	if (Array.isArray(value)) return value.map(stable);
	if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,stable(value[key])]));
	return value;
}
const digest = value => hash(Buffer.from(JSON.stringify(stable(value))));
export function bodyFingerprint(tree) {
	const imageDefinitions = new Set();
	const walk = node=>{if(node.type==="imageReference")imageDefinitions.add(node.identifier);for(const child of node.children||[])walk(child);};walk(tree);
	const clean = node=>Object.fromEntries(Object.entries(node).filter(([key])=>key!=="position").map(([key,value])=>[
		key,key==="url"&&(node.type==="image" || node.type==="definition"&&imageDefinitions.has(node.identifier)) ? "@image" : key==="children" ? value.map(clean) : value,
	]));
	return digest(clean(tree));
}
const metadataFingerprint = article => { const {image,...metadata}=article.data;return digest(metadata); };
function projectFile(relative) {
	assert.ok(typeof relative==="string" && !path.isAbsolute(relative) && !relative.includes("\\"),"Use a project-relative path with forward slashes");
	const absolute=path.resolve(projectRoot,relative);
	assert.ok(absolute.startsWith(projectRoot.replace(/[\\/]$/,"")+path.sep),"Path outside project");
	return absolute;
}
function validTarget(target) {
	assert.match(target,/^src\/content\/posts\/[^/]+\/index\.md$/,"Target must be src/content/posts/<article>/index.md");
	assert.ok(![".",".."].includes(target.split("/")[3]) && !/[<>:"|?*\u0000-\u001f]/.test(target),"Invalid article directory");
	projectFile(target);return target;
}
const safeStem = text => { const stem=text.normalize("NFKC").replace(/\s+w-\d+(?:px|%)/g,"").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,"-").replace(/^-+|-+$/g,"").slice(0,64) || "illustration";return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(stem)?"image-"+stem:stem; };
export function proposedImageName(url,alt,index) {
	const basename=path.posix.basename(decodeURIComponent(url.split(/[?#]/,1)[0]));
	const extension=path.posix.extname(basename).toLowerCase();
	const stem=basename.slice(0,-extension.length);
	const generic=/^(?:pixpin|image[-_\d]|screenshot|屏幕截图|图片)/i.test(stem);
	if(!generic && /^[\p{L}\p{N}_-]+\.[a-z\d]+$/iu.test(basename) && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) return basename;
	return `${safeStem(generic ? alt||`illustration-${index+1}` : stem)}${extension}`;
}

export async function createMigrationPlan({source,sourcePath,target,allowExisting=false,map={},context,readAsset=readFile}) {
	validTarget(target);
	const documents=context?.documents || await readDocuments();
	const permalink=context?.permalink || await readPermalinkConfig();
	const staticRoutes=context?.staticRoutes || await readStaticRoutes();
	const existing=documents.find(document=>document.file===target);
	assert.ok(!existing || allowExisting,"Target article exists; review before using --allow-existing");
	const audit=await auditContent({documents:documents.filter(document=>document.file!==target).concat([{file:target,source}]),permalink,staticRoutes,inspectFile:async()=>"ok"});
	const issues=audit.issues.filter(issue=>issue.level==="error" && !(issue.file===target && issue.code.startsWith("resource-")));
	for(const issue of audit.issues.filter(issue=>issue.file===target && issue.code==="relative-attachment")) issues.push({...issue,level:"error",message:"附件需先改为已发布的站内或外部地址；相对附件不会自动打包"});
	const article=audit.articles.find(article=>article.file===target);
	assert.ok(article,`Source needs valid frontmatter: ${issues.map(issue=>issue.message).join("; ")}`);
	const references=[],assets=[],destinations=new Map(),bySource=new Map();
	for(const[imageIndex,ref]of imageReferences(article).entries()) {
		if(/^(?:https?:|data:|\/\/)/i.test(ref.url)){references.push({kind:ref.kind,sourceReference:ref.url,targetReference:ref.url,hash:null});continue;}
		assert.ok(!/^[a-z][a-z\d+.-]*:/i.test(ref.url) && !ref.url.includes("\\"),`Invalid image source: ${ref.url}`);
		const clean=decodeURIComponent(ref.url.split(/[?#]/,1)[0]);
		assert.ok(!/[\\\u0000-\u001f]/.test(clean),`Invalid encoded image path: ${ref.url}`);
		const publicImage=clean.startsWith("/");
		if(publicImage) assert.ok(!clean.split("/").includes(".."),"Public image must stay inside public");
		const absolute=publicImage?projectFile("public/"+clean.slice(1)):path.resolve(path.dirname(sourcePath),clean);
		const bytes=await readAsset(absolute);
		const metadata=await sharp(bytes).metadata();
		const extension=path.extname(clean).slice(1).toLowerCase();
		assert.ok(["png","jpg","jpeg","webp","avif","gif","svg"].includes(extension),`Unsupported image format: ${ref.url}`);
		assert.equal(metadata.format,({jpg:"jpeg",avif:"heif"})[extension]||extension,`Image extension differs from actual bytes: ${ref.url}`);
		const fingerprint=hash(bytes);
		let proposed=publicImage?ref.url:map[ref.url] || (ref.kind==="cover"?"./cover"+path.extname(clean).toLowerCase():"index.assets/"+proposedImageName(ref.url,ref.node?.alt,imageIndex));
		if(!publicImage) {
			assert.ok(ref.kind==="cover" ? /^\.\/[\p{L}\p{N}_-]+\.[a-z\d]+$/iu.test(proposed) : /^index\.assets\/[\p{L}\p{N}_-]+\.[a-z\d]+$/iu.test(proposed),`Invalid planned image name: ${proposed}`);
			assert.ok(!/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(path.posix.basename(proposed)),"Reserved Windows image name");
			const key=ref.kind+":"+absolute;
			if(bySource.has(key)) proposed=bySource.get(key);else{
				const stem=proposed.slice(0,-path.posix.extname(proposed).length),extension=path.posix.extname(proposed);let suffix=2;
				while(destinations.has(proposed.toLocaleLowerCase()) && destinations.get(proposed.toLocaleLowerCase())!==absolute){assert.ok(!map[ref.url],`Explicit mapping collides: ${proposed}`);proposed=`${stem}-${suffix++}${extension}`;}
				destinations.set(proposed.toLocaleLowerCase(),absolute);bySource.set(key,proposed);
			}
		}
		const targetFile=publicImage?"public/"+clean.slice(1):path.posix.join(path.posix.dirname(target),proposed);
		projectFile(targetFile);
		try { const existingBytes=await readFile(projectFile(targetFile));assert.equal(hash(existingBytes),fingerprint,`Destination image already exists with different bytes: ${targetFile}`); } catch(error) { if(error.code!=="ENOENT")throw error; }
		if(!assets.some(asset=>asset.target===targetFile)) assets.push({source:absolute,target:targetFile,hash:fingerprint,bytes:bytes.length,copy:!publicImage});
		const suffix=publicImage?"":ref.url.slice(ref.url.split(/[?#]/,1)[0].length);
		references.push({kind:ref.kind,sourceReference:ref.url,targetReference:proposed+suffix,hash:fingerprint});
	}
	const priorAudit=await auditContent({documents,permalink,staticRoutes,inspectFile:async()=>"ok"});
	if(existing){
		const prior=priorAudit.articles.find(post=>post.file===target);
		assert.equal(commentTermForArticle(article),commentTermForArticle(prior),"Existing article comment identity would change; preserve commentId before planning");
	}
	const targetDirectory=path.posix.dirname(target)+"/";
	let protectedFiles=context?.protectedFiles;
	if(!protectedFiles){protectedFiles=[];for(const file of await listFiles("src/content/posts")){const relative="src/content/posts/"+file;if(!relative.startsWith(targetDirectory))protectedFiles.push({file:relative,hash:hash(await readFile(projectFile(relative)))});}}
	const protectedPosts=priorAudit.articles.filter(post=>post.file!==target).map(post=>({file:post.file,url:post.url,commentTerm:commentTermForArticle(post)}));
	for(const prior of protectedPosts){const after=audit.articles.find(post=>post.file===prior.file);if(after?.url!==prior.url || commentTermForArticle(after)!==prior.commentTerm)issues.push({level:"error",file:prior.file,message:"New article would change an existing URL or comment identity"});}
	return {schema:1,createdAt:new Date().toISOString(),source:sourcePath,sourceHash:hash(Buffer.from(source)),target,metadataHash:metadataFingerprint(article),bodyHash:bodyFingerprint(article.tree),url:article.url,commentTerm:commentTermForArticle(article),references,assets,protectedFiles,protectedPosts,issues};
}

export async function verifyMigration(plan,{articles,read=readFile}={}) {
	assert.equal(plan.schema,1);validTarget(plan.target);assert.equal(plan.issues.length,0,"Plan contains blocking issues");
	if(!articles){const audit=await auditProject();assert.equal(audit.issues.filter(issue=>issue.level==="error").length,0,"Content audit must pass");articles=audit.articles;}
	const article=articles.find(article=>article.file===plan.target);assert.ok(article,"Target article is missing");
	assert.equal(article.url,plan.url,"Article URL changed");assert.equal(commentTermForArticle(article),plan.commentTerm,"Comment identity changed");
	assert.equal(metadataFingerprint(article),plan.metadataHash,"Metadata differs from the approved draft");
	assert.equal(bodyFingerprint(article.tree),plan.bodyHash,"Article prose, formulas, code, captions or links changed");
	const refs=imageReferences(article);assert.equal(refs.length,plan.references.length,"Image reference count changed");
	for(let index=0;index<refs.length;index++) {assert.equal(refs[index].kind,plan.references[index].kind);assert.equal(refs[index].url,plan.references[index].targetReference,`Image order or mapping changed at #${index+1}`);}
	const inspect=read===readFile?createFileInspector():async()=>"ok";
	for(const asset of plan.assets){assert.equal(await inspect(projectFile(asset.target)),"ok",`Image path missing or case differs: ${asset.target}`);assert.equal(hash(await read(projectFile(asset.target))),asset.hash,`Image bytes changed: ${asset.target}`);}
	for(const item of plan.protectedFiles){assert.equal(await inspect(projectFile(item.file)),"ok",`Protected path missing or case differs: ${item.file}`);assert.equal(hash(await read(projectFile(item.file))),item.hash,`Existing content changed or disappeared: ${item.file}`);}
	for(const item of plan.protectedPosts){const post=articles.find(post=>post.file===item.file);assert.ok(post,`Existing article missing: ${item.file}`);assert.equal(post.url,item.url);assert.equal(commentTermForArticle(post),item.commentTerm);}
	return {article:plan.target,images:plan.assets.length,references:refs.length,protectedFiles:plan.protectedFiles.length};
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
	const args=process.argv.slice(2),get=name=>args.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3);
	if(get("verify")){const plan=JSON.parse(await readFile(get("verify"),"utf8"));console.log("PASS migration",await verifyMigration(plan));}
	else{
		assert.ok(get("source")&&get("target"),"Use --source=<draft.md> --target=src/content/posts/<article>/index.md --report=.git/article-import.json, or --verify=<report.json>");
		const sourcePath=path.resolve(get("source"));
		const plan=await createMigrationPlan({source:await readFile(sourcePath,"utf8"),sourcePath,target:get("target"),allowExisting:args.includes("--allow-existing"),map:get("map")?JSON.parse(await readFile(get("map"),"utf8")):{}});
		if(get("report")){assert.match(get("report"),/\.json$/i,"Report must be JSON; never overwrite an article or image");await writeFile(get("report"),JSON.stringify(plan,null,2)+"\n",{flag:"wx"});}else console.log(JSON.stringify(plan,null,2));
		assert.equal(plan.issues.length,0,JSON.stringify(plan.issues));
		console.log(`PASS migration plan: ${plan.assets.length} assets, ${plan.references.length} references; no article or image files written`);
	}
}
