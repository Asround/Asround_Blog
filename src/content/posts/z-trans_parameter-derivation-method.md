---
title: Z逆变换求解中的参数求导法
published: 2026-01-10
pinned: false
description: 有点意思的想法.
tags: [z变换, 数字信号处理, 巧思]
category: 数学巧思
# licenseName: "Unlicensed"
author: Asround
draft: false
---
# Z逆变换求解中的参数求导法

> 本文重要解法来源: [信号:z的逆变换 - Kedur](https://zhuanlan.zhihu.com/p/705299141), [作者主页(Kedur)](https://www.zhihu.com/people/oop2cj). 内容在原文最后两页部分. 当时看到后觉得很新颖但稍微一想又觉得十分合理, 和室友分享后他们也认为是个不错的解法, 甚至可以辅助证明一些 $$z$$ 变换的性质(以帮助记忆). **<u>喜欢这个解法的可以去给原作者点点赞同和喜欢.</u>** 本人只是个搬运工~

## 1. 问题描述
求函数

$$
X(z)=\frac{z^3+z^2}{(z-1)^3}, \quad |z|>1
$$

的逆 $z$ 变换 $x[n]$.

---

## 参数求导法求解

### 思考与引入

一般来说, 遇到分母次数更高的问题, 一般思路是先将其因式分解, 然后再单独解决每一项:

$$
\begin{aligned}
\frac{X(z)}{z} = \frac{z^2+z}{(z-1)^3} &= \frac{[(z^2-1)+(z-1)]+2}{(z-1)^3}
\\
 &= \frac{2}{(z-1)^3}+\frac{z+2}{(z-1)^2}
\\
 &= \frac{2}{(z-1)^3}+\frac{(z-1)+3}{(z-1)^2}
\\
 &= \frac{2}{(z-1)^3}+\frac{3}{(z-1)^2} + \frac{1}{z-1}
\\

\Longrightarrow X(z) &=\frac{z}{z-1} + \frac{3z}{(z-1)^2} + \frac{2z}{(z-1)^3}


\end{aligned}
$$

> 注, 这里使用 $X(z)/z$ 并不是先射箭再画靶的做法, 而是一种比较普遍的变形. 原因在于 $a^nu[n]$ 的 $z$ 变换为 $z/(z-a)$. 当部分分式分解出现 $1/(z-a)$ 后, 将左式 $z$ 乘过去即可得到标准形式. 读者在多练习一些题目后会理解这种做法的好处. 本题直接分解当然也可行, 不过要利用一下立方差公式, 并不太困难.

这里第一项倒是好解决的, 但是后面的 **<u>分母高次重根</u>**, 一般的思路是应用 z 域求导的性质来解决:

$$
nx[n] = -z\frac{\mathrm{d}X(z)}{\mathrm{d}z} 
$$

但是有一个小问题, 这会 **<u>引入新的</u>** $z$ **<u>因子</u>**(准确来说是 $-z$ 因子), 而原式中并没有随着分母重根次数变高而有更多的 $z$ 因子, 这意味着我们还需要使用时移性质来解决这些 $z$ 因子的问题, 虽然也并不困难, 但不够优雅(对本题).

所以我们不禁发问, 是否有不引入 $z$ 因子, 而能让分母次数变高的方法呢? 自然是有的, **<u>对</u>** $a$ **<u>而非</u>** $z$ **<u>求导即可</u>**.

### 理论基础

已知基本变换对: 

$$
a^n u[n] \leftrightarrow \frac{z}{z-a}, \quad |z|>|a|
$$

对参数 $a$ 求导: (直接使用 $z$ 变换定义式易证, 读者可以作为练习试证一下)

一阶导: 

$$
\frac{\partial}{\partial a}\left(\frac{z}{z-a}\right) = \frac{z}{(z-a)^2}, \quad 
\frac{\partial}{\partial a}\left(a^n u[n]\right) = n a^{n-1} u[n]
$$

得: 

$$
n a^{n-1} u[n] \leftrightarrow \frac{z}{(z-a)^2}
$$

二阶导: 

$$
\frac{\partial^2}{\partial a^2}\left(\frac{z}{z-a}\right) = \frac{2z}{(z-a)^3}, \quad 
\frac{\partial^2}{\partial a^2}\left(a^n u[n]\right) = n(n-1) a^{n-2} u[n]
$$

得: 

$$
\frac{1}{2}n(n-1) a^{n-2} u[n] \leftrightarrow \frac{z}{(z-a)^3}
$$

### 应用于本题
令 $a=1$ , 将 $X(z)$ 表示为: (前面已经推出)

$$
X(z) = \frac{z}{z-1} + \frac{3z}{(z-1)^2} + \frac{2z}{(z-1)^3}
$$

利用上述变换对: 

$$
\begin{aligned}
\frac{z}{z-1} &\leftrightarrow 1^n u[n] = u[n] \\
\frac{z}{(z-1)^2} &\leftrightarrow n \cdot 1^{n-1} u[n] = n u[n] \\
\frac{z}{(z-1)^3} &\leftrightarrow \frac{1}{2}n(n-1) \cdot 1^{n-2} u[n] = \frac{1}{2}n(n-1) u[n]
\end{aligned}
$$

叠加: 

$$
\begin{aligned}
x[n] &= u[n] + 3n u[n] + 2\cdot\frac{1}{2}n(n-1) u[n] \\
&= (1 + 3n + n^2 - n) u[n] \\
&= (n^2 + 2n + 1) u[n] \\
&= (n+1)^2 u[n]
\end{aligned}
$$

觉得这个方法不错的记得顺手给原作者点点赞同: [原文链接](https://zhuanlan.zhihu.com/p/705299141)

---

### 解决更复杂重根问题的扩展技巧

对于一般有理函数 $X(z) = \frac{P(z)}{(z-a)^m}$ , 其中 $P(z)$ 为多项式, 可结合以下技巧: 

1. **提取 $z$ 的幂因子（时移）**  

   若 $X(z)$ 分子含有 $z^k$ 因子, 可先提取出来:
   
   $$
   X(z) = z^k \cdot \frac{P_1(z)}{(z-a)^m}
   $$
   
   则逆变换为 $x[n] = x_1[n-k]$ , 其中 $x_1[n] \leftrightarrow \frac{P_1(z)}{(z-a)^m}$. (结合时移性质)

2. **部分分式分解通用公式**
   对于重根 $z=a$ , 展开形式为: 
   
   $$
   \frac{X(z)}{z} = \sum_{k=1}^m \frac{A_k}{(z-a)^k} + \text{其他单根项}
   $$
   
   乘以 $z$ 后: 
   
   $$
   X(z) = \sum_{k=1}^m \frac{A_k z}{(z-a)^k} + \cdots
   $$
   
   每项对应变换:
   
   $$
   \mathcal{Z}^{-1}\left\{\frac{z}{(z-a)^k}\right\} = \binom{n}{k-1} a^{n-k+1} u[n]
   $$
   
   其中 $\binom{n}{k-1} = \frac{n(n-1)\cdots(n-k+2)}{(k-1)!}$. 

3. **参数求导法的推广**  
   从基本对 $a^n u[n] \leftrightarrow \frac{z}{z-a}$ 出发, 对 $a$ 求 $k-1$ 次导:
   $$
   \frac{\partial^{k-1}}{\partial a^{k-1}} \left(\frac{z}{z-a}\right) = \frac{(k-1)! \, z}{(z-a)^k}
   $$
   
   $$
   \frac{\partial^{k-1}}{\partial a^{k-1}} \left(a^n u[n]\right) = n(n-1)\cdots(n-k+2) a^{n-k+1} u[n]
   $$
   
   整理得上述公式. 

## 其他解法

> 随便看看就行, 我觉得都完全不如上面的解法. 需要基于对复杂已知变换对的硬性记忆的方法我个人认为价值都不大, 只推荐记忆力很好的读者使用.

###   解法一: 直接利用已知变换对

已知z变换对: (利用 z 域求导的性质)

$$
n^2 u[n] \leftrightarrow \frac{z(z+1)}{(z-1)^3}
$$

将 $X(z)$ 改写: 

$$
X(z) = \frac{z^2(z+1)}{(z-1)^3} = z \cdot \frac{z(z+1)}{(z-1)^3}
$$

令 $Y(z) = \dfrac{z(z+1)}{(z-1)^3}$ , 则 $y[n] = n^2 u[n]$ , 且 $X(z)=zY(z)$ . 

根据z变换的移位性质: $zY(z) \leftrightarrow y[n+1]$ , 得: 

$$
x[n] = (n+1)^2 u[n+1]
$$

注意: 

- 当 $n \ge 0$ 时,$u[n+1]=1$ , $x[n]=(n+1)^2$
- 当 $n=-1$ 时,$(n+1)^2=0$ , 且$u[0]=1$ , 但代入公式得 $x[-1]=0$
- 当 $n<-1$ 时,$u[n+1]=0$

因此序列可简化为: 

$$
x[n] = (n+1)^2 u[n]
$$

---

### 解法二: 部分分式分解法

> 部分分式展开用了更一般的方法, 但是没用 $z$ 变换的直接性质去求解各部分

- 步骤1: 计算 $X(z)/z$

$$
\frac{X(z)}{z} = \frac{z^2+z}{(z-1)^3}
$$

步骤2: 部分分式展开

设

$$
\frac{z^2+z}{(z-1)^3} = \frac{A}{z-1} + \frac{B}{(z-1)^2} + \frac{C}{(z-1)^3}
$$
两边乘以 $(z-1)^3$: 

$$
z^2+z = A(z-1)^2 + B(z-1) + C
$$

展开右边: 

$$
A(z^2-2z+1)+B(z-1)+C = Az^2 + (-2A+B)z + (A-B+C)
$$

比较系数: 

$$
\begin{cases}
A = 1 \\
-2A+B = 1 \\
A-B+C = 0
\end{cases}
$$

解得 $A=1, B=3, C=2$. 

因此: 

$$
\frac{X(z)}{z} = \frac{1}{z-1} + \frac{3}{(z-1)^2} + \frac{2}{(z-1)^3}
$$

$$
X(z) = \frac{z}{z-1} + \frac{3z}{(z-1)^2} + \frac{2z}{(z-1)^3}
$$

- 步骤3: 求各项逆变换

已知（右边序列）: (如何已知的呢?)

$$
\begin{aligned}
\mathcal{Z}^{-1}\left\{\frac{z}{z-1}\right\} &= u[n] \\
\mathcal{Z}^{-1}\left\{\frac{z}{(z-1)^2}\right\} &= n u[n] \\
\mathcal{Z}^{-1}\left\{\frac{z}{(z-1)^3}\right\} &= \frac{n(n-1)}{2} u[n]
\end{aligned}
$$

- 步骤4: 叠加结果

$$
\begin{aligned}
x[n] &= u[n] + 3n u[n] + 2\cdot\frac{n(n-1)}{2} u[n] \\
&= (1 + 3n + n^2 - n) u[n] \\
&= (n^2 + 2n + 1) u[n] \\
&= (n+1)^2 u[n]
\end{aligned}
$$
