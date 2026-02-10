---
title: 数学物理方法非标小测分享
published: 2024-12-21
pinned: false
description: 凑欧拉公式思想的应用.
tags: [数学, 数学物理方法]
category: 数学巧思
licenseName: "Unlicensed"
author: Asround
date: 2024-12-21
pubDate: 2024-12-21
draft: false
permalink: "methods-of-mathmatical-physics"
---
# 数学物理方法非标小测


## 题目选择

​	选择所给第一个题目（找一个非作业定积分题目，并使用数学分析以及复变函数方法求解），其描述如下：

计算如下定积分:


$$
\int_0^{2\pi}e^{\sin{nx}}\{\sin[x-\cos(nx)]\}\mathrm{d}x,n\in \mathbb{Z} \notag
$$
注：题目来源：https://www.zhihu.com/question/524839420

## 题目求解

​	要求分别使用数学分析和复变函数的方法求解，但本人并未学习过数学分析，所以此处理解为使用“微积分”的方法。

### 微积分方法求解

​	本题的微积分方法是比较繁琐的。记原积分为$I$，被积函数为$f(x)=e^{\sin{nx}}g(x)$

首先根据正弦函数的和差角公式将被积函数展开：
$$
g(x)=\sin{[x-\cos{(nx)}]}=\sin{x}\cos{\cos{nx}}-\cos{x}\sin{\cos{nx}}\notag
$$
则原积分可以表示为：
$$
I=\int_0^{2\pi}\sin{(x)}e^{\sin{nx}}\cos\cos{nx}-\cos{(x)}e^{\sin{nx}}\sin{\cos{nx}}\,\mathrm{d}x\notag
$$
借助以下两个级数：
$$
\begin{align}
\sum_{k=0}^\infty\frac{\sin{(k(nx-\frac{\pi}{2}))}}{k!}&=-e^{\sin{nx}}\sin{\cos{nx}}\notag
\\
\sum_{k=0}^\infty\frac{\cos{(k(nx-\frac{\pi}{2}))}}{k!}&=\;\;\,e^{\sin{nx}}\cos{\cos{nx}}\notag
\end{align}
$$
级数可化为：
$$
I=\int_0^{2\pi}\sin{(x)}\sum_{k=0}^\infty\frac{\cos{(k(nx-\frac{\pi}{2}))}}{k!}
+
\cos{(x)}\sum_{k=0}^\infty\frac{\sin{(k(nx-\frac{\pi}{2}))}}{k!}\,\mathrm{d}x\notag
$$
<div style="page-break-after: always;"></div>

函数项级数在$[0,2\pi]$上一致收敛，且一般项都连续，所以积分和求和可以交换顺序：
$$
I=\sum_{k=0}^\infty \frac{1}{k!}\int_0^{2\pi}\sin{(x)}\cos{(k(nx-\frac{\pi}{2}))}\,\mathrm{d}x
+
\sum_{k=0}^\infty \frac{1}{k!} \int_0^{2\pi}\cos{(x)}\sin{(k(nx-\frac{\pi}{2}))}\,\mathrm{d}x\notag
$$
此时容易求解出积分：
$$
\begin{align}
I=&\sum_{k=0}^\infty \frac{1}{k!}\int_0^{2\pi}\frac{kn}{k^2n^2-1}\{\cos(\frac{\pi k}{2})-\cos[\frac{\pi k(1-4n)}{2}]\}\notag
+\\
&\sum_{k=0}^\infty \frac{1}{k!}\int_0^{2\pi}\frac{1}{k^2n^2-1}\{-\cos(\frac{\pi k}{2})+\cos[\frac{\pi k(1-4n)}{2}]\}\notag
\end{align}
$$
此时不容易发现什么特殊性，我们使用三角函数和差角公式展开：
$$
\begin{align}
I=&\sum_{k=0}^{\infty}\frac{1}{k!(k^2n^2-1)}\{\sin(\frac{\pi k}{2})\sin(2k\pi n)+\cos(\frac{k\pi}{2})\cos(2\pi kn)-\cos(\frac{\pi k}{2})\}\notag
+\\
&\sum_{k=0}^{\infty}\frac{kn}{k!(k^2n^2-1)}\{-\sin(\frac{\pi k}{2})\sin(2k\pi n)+\cos(\frac{k\pi}{2})[-\cos(2\pi kn)]+\cos(\frac{\pi k}{2})\}\notag
\end{align}
$$
当$n\neq \pm1$时，分母不为$0$，三角函数的因子为0，故：
$$
I=0\;,\;\;when \;\; n \neq \pm1\notag
$$
接下来讨论 $n=1$ 和 $n=-1$ 的情况，此时依然利用前面的级数，但需要单独把前两项写出来：

- $n=1$：
  $$
  \begin{align}
  -e^{\sin x}\sin{\cos{x}}&=\frac{\sin[0(x-\frac{\pi}{2})]}{0!}+\frac{\sin[1(x-\frac{\pi}2)]}{1!}
  + \sum_{k=2}^{\infty} \frac{\sin[k(x-\frac{\pi}{2})]}{k!}\notag
  \\
  e^{\sin x}\cos{\cos{x}}&=\frac{\cos[0(x-\frac{\pi}{2})]}{0!}+\frac{\cos[1(x-\frac{\pi}2)]}{1!}
  + \sum_{k=2}^{\infty} \frac{\cos[k(x-\frac{\pi}{2})]}{k!}\notag
  \end{align}
  $$
  带入$I=\int_0^{2\pi}\sin{(x)}e^{\sin{nx}}\cos\cos{nx}-\cos{(x)}e^{\sin{nx}}\sin{\cos{nx}}\,\mathrm{d}x$ 中，并由前文推导知含级数项为零：
  $$
  I=\int_0^{2\pi}\cos x(\frac{\sin[0(x-\frac{\pi}{2})]}{0!}+\frac{\sin[1(x-\frac{\pi}2)]}{1!})
  +
  \sin x(\frac{\cos[0(x-\frac{\pi}{2})]}{0!}+\frac{\cos[1(x-\frac{\pi}2)]}{1!}\mathrm{d}x
  )=0\notag
  $$

- $n=-1$：
  $$
  \begin{align}
  -e^{\sin (-x)}\sin{\cos{(-x)}}&=\frac{\sin[0(-x-\frac{\pi}{2})]}{0!}+\frac{\sin[1(-x-\frac{\pi}2)]}{1!}
  + \sum_{k=2}^{\infty} \frac{\sin[k(-x-\frac{\pi}{2})]}{k!}\notag
  \\
  e^{\sin (-x)}\cos{\cos{(-x)}}&=\frac{\cos[0(-x-\frac{\pi}{2})]}{0!}+\frac{\cos[1(-x-\frac{\pi}2)]}{1!}
  + \sum_{k=2}^{\infty} \frac{\cos[k(-x-\frac{\pi}{2})]}{k!}\notag
  \end{align}
  $$
  带入$I=\int_0^{2\pi}\sin{(x)}e^{\sin{nx}}\cos\cos{nx}-\cos{(x)}e^{\sin{nx}}\sin{\cos{nx}}\,\mathrm{d}x$ 中，并由前文推导知含级数项为零：
  $$
  I=\int_0^{2\pi}\cos x(\frac{\sin[0(-x-\frac{\pi}{2})]}{0!}+\frac{\sin[1(-x-\frac{\pi}2)]}{1!})
  +
  \sin x(\frac{\cos[0(-x-\frac{\pi}{2})]}{0!}+\frac{\cos[1(-x-\frac{\pi}2)]}{1!})\mathrm{d}x
  =-2\pi\notag
  $$

综上所述：
$$
\int_0^{2\pi}e^{\sin{nx}}\{\sin[x-\cos(nx)]\}\mathrm{d}x=
\begin{cases}
\begin{align}
-2\pi\;\;\,,&\;n=-1\notag
\\
0\;\;,&\;n=\mathbb{Z}\,\text{且}\,n\neq-1\notag
\end{align}
\end{cases}
$$

### 复变函数方法求解

​	在本学期的课程中，类似的问题只介绍了有理三角函数的积分，即：
$$
\int_\alpha^{\alpha+2\pi}R(\cos\theta,\sin\theta)\mathrm{d}\theta\notag
$$
​	其中$R(\cos\theta\sin\theta)$为$\sin\theta,\cos\theta$的有理函数，且在$-\infty<\theta<+\infty$上连续

​	本题的函数显然**不是有理三角函数**，而是较为复杂的函数，但我们也可以**仿照课程方法**进行求解。

#### 凑欧拉公式并利用留数定理求解


为求解原积分$I_1$，我们首先求解积分$I_2$，再利用$I_1,I_2$ 关系求解$I_1$：(<font color=blue>**这是受到PPT“Ch6-留数及其应用”中例2解法二的启发**</font>)
$$
I_2=\int_0^{2\pi}e^{-ie^{inx}}e^{ix}\mathrm{d}x,n\in \mathbb{Z}\notag
\\
I_1=\mathrm{Im}[I_2]\notag
$$
令$z=e^{ix}$ ，则$\mathrm{d}x=\mathrm{d}z/iz$，积分转换为：
$$
I_2=\oint_{|z|=1}e^{-iz^n} z \frac{\mathrm{d}z}{iz}=\oint_{|z|=1}-ie^{-iz^n}\mathrm{d}z,n\in\mathbb{Z}\notag
$$
对于这个积分，我们可以使用<font color=red>**留数定理**</font>进行求解。并且注意到随着 $n$ 的取值不同，被积复变函数的解析性不同，所以以下根据 $n$ 的取值范围来讨论：(以下范围省略整数的描述)

- $n$ > 0：

​	此时的被积函数为解析函数，由Cauchy积分定理:
$$
I_2=0\notag
\\
\therefore I_1=\mathrm{Im}[I_2]=0\notag
$$
- $n=-1$：

  此时，$z=0$为被积函数的<font color=red>**本性奇点**</font>。在课程范围内，我们只能对函数进行展开，得到其<font color=red>**洛朗级数**</font>，并由$-1$次幂的系数确定其留数。

  $$
  -ie^{-iz^{-1}}=
  -i\sum_{n=0}^{+\infty}\frac{(-i\frac{1}{z})^n}{n!}=
  -i(1+\frac{-iz^{-1}}{1!}+\frac{i^2z^{-2}}{2!}+...)\notag
  $$
  可以得出$z=0$处留数：
  $$
  \mathrm{Res}[-ie^{-iz^{-1}},0]=(-i)^2=-1\notag
  $$
  由留数定理可得：
  $$
  \begin{align}
  &I_2=2\pi i\,\mathrm{Res}[-ie^{-iz^{-1}},0]=-2\pi i\notag
  \\
  \therefore\;& I_1=\mathrm{Im}[I_2]=-2\pi\notag
  \end{align}
  $$
  
- $n<0$ 且 $n\neq-1$：

  此时，z=0仍然为本性奇点，仍然使用展开为洛朗级数的方法考察其留数：
  $$
  -ie^{-iz^{-n}}=
  -i\sum_{k=0}^{+\infty}\frac{(-i\frac{1}{z^n})^k}{k!}=
  -i(1+\frac{-iz^{-n}}{1!}+\frac{i^2z^{-2n}}{2!}+...)\notag
  $$
  可以发现，不存在负一次项，则:
  $$
  \begin{align}
  &c_{-1}=0,\;\mathrm{Res}[-ie^{-iz^{-n}},0]=0\notag
  \\ \therefore \;&I_2=2\pi i\,\mathrm{Res}[-ie^{-iz^{-n}},0]=0\notag
  \\ \therefore \;&I_1=\mathrm{Im}[I_2]=0\notag
  \end{align}
  $$
  

综上所述：

$$
\int_0^{2\pi}e^{\sin{nx}}\{\sin[x-\cos(nx)]\}\mathrm{d}x=
\begin{cases}
\begin{align}
-2\pi\;\;\,,&\;n=-1\notag
\\
0\;\;,&\;n=\mathbb{Z}\,且\,n\neq-1\notag
\end{align}
\end{cases}
$$