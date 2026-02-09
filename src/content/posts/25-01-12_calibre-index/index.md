---
title: 给纯文本 .txt 文件批量添加目录
published: 2025-07-12
pinned: false
description: 基于 Calibre 软件的简单应用.
tags: [Calibre, 电子书]
category: Tutorial
licenseName: "CC BY-SA 4.0"
author: Asround
# sourceLink: "https://github.com/emn178/markdown"
draft: false
date: 2025-07-12
image: "cover.png"
pubDate: 2025-07-12
permalink: "calibre_index"
---

# 纯txt文件批量添加目录

参考: [【工具使用】calibre自动生成目录](https://www.bilibili.com/video/BV1E3411q7um/)

本文使用的正则表达式为链接内视频up主提供. 但up主似乎未说明"目录"板块的操作, 本文做一个简单的添加补充.

## 背景

​	在网络上找到小说的纯 txt 文本, 但用 calibre 转为 epub 格式后发现没有索引目录. 本文档将介绍一种最简单的方式自动添加可索引目录(也即多级标题). 

## 要求

1. 找到的 txt 文本中, 每一章单独列句成段.
2. 已经下载 calibre 软件

## 具体操作

以笔者最近下载的一篇小说<月光照不到>为例.

1. 点击添加书籍, 将书籍添加到 calibre 内.
![PixPin_2025-07-12_09-49-45](calibre_index.assets/PixPin_2025-07-12_09-49-45.png)

2. 选中该书籍, 并点击"转换书籍"(上图"添加书籍"的右侧第二个), 并按下图进行填写:(填写的内容见图后)

![PixPin_2025-07-12_09-51-40](calibre_index.assets/PixPin_2025-07-12_09-51-40.png)

![PixPin_2025-07-12_09-52-35](calibre_index.assets/PixPin_2025-07-12_09-52-35.png)

填写的表达式为:

```
//*[re:test(., "^\s*[第卷][0123456789一二三四五六七八九十零〇百千两]*[章回幕部节集卷].*", "i")]
```

设置好后点击右下角确认, 然后等待书籍转换完成即可.



## 结果展示

​	按照刚才的操作, 转换后打开图书, 可发现:

![PixPin_2025-07-12_09-53-47](calibre_index.assets/PixPin_2025-07-12_09-53-47.png)

​	成功添加了可索引目录.

​	并且每一章都会另起一页.

> 注: 如果转换出来, 发现某些段落也被识别为了章节, 可以重新走一遍上面的流程, 并在转换界面中"目录"里, 勾选"在转换完成后手动精细调整目录", 然后在里面删去多余的章节索引即可. 
>
> 更多的问题可以与ai交流, 比如修改表达式以达到不同的匹配目的等, 本文力求简单, 便不再赘述.