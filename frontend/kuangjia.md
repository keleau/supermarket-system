请生成Vue3+Vite前端整体项目框架，使用<script setup lang="js">语法，Element Plus，vue-router，axios。
只搭建前端骨架，views下只创建空页面占位，不写页面内表格、弹窗等详细业务代码，后续单独开发页面。可使用any简化类型，不强制复杂TS类型定义。
【约定：后端使用Node.js开发，前端定义好接口契约，为Node后端留出完整开发空间】
【要求：main.ts中全局引入Element Plus组件库】

硬性约束：
1. 只写前端代码，不要编写Node后端业务代码，只定义接口的请求方式、url、入参、返回数据结构，Node后端按照这个契约去实现接口。
2. 所有网络请求使用axios，统一baseURL="/api"，所有接口地址以/api/开头。
3. 响应体统一规范（Node后端要遵守这个返回格式）：
{
  code: number, // 200成功，非200失败
  msg: string,
  data: any
}
4. 路由权限：登录拿到角色（管理员 / 仓管），管理员可以访问全部路由；仓管隐藏系统管理相关路由。
5. 页面结构：登录页 + Layout主布局（左侧可折叠侧边菜单、顶部导航栏、面包屑、内容容器）
Layout布局采用深色左侧侧边栏，白色主体内容区，侧边栏展开折叠增加过渡动画。

菜单路由清单（views内全部是空页面，页面文字提示【xxx页面，待开发】）
- /login 登录页
- /dashboard 运营概览首页
- /product
  - /product/list 商品列表
  - /product/category 商品分类
- /stock
  - /stock/inbound 入库明细
  - /stock/outbound 出库明细
  - /stock/warn 库存预警
  - /stock/log 出入库流水
  - /stock/statistics 库存统计
- /supplier 供应商管理
- /system
  - /system/user 用户管理
  - /system/profile 个人中心（修改密码）

6. 登录逻辑：
前端提交账号密码 POST /api/user/login
入参：{username,password}
后端(Node)返回：{code,msg,data:{token,roleName}}
前端拿到token存入localStorage；路由全局守卫，无token自动跳转登录页。
7. Layout功能：
侧边栏根据角色动态渲染菜单，侧边栏展开/折叠过渡动画；面包屑自动读取路由；顶部显示用户名、退出登录按钮；退出时清除localStorage token，跳登录页。
8. 前端仅做轻量表单校验（非空、数字大于0）；**所有核心业务校验（出库库存是否充足、库存变动、自动生成流水记录）全部交给Node后端处理。前端接收后端返回的错误信息弹窗提示**。
9. 项目文件结构：
src
├── api
│   └── request.ts        # axios封装，请求拦截器自动带上token；响应拦截器统一处理错误提示
├── router
│   └── index.ts          # 路由配置 + 路由守卫、角色权限判断
├── layout
│   └── Layout.vue        # 主布局容器
├── views                 # 所有页面空组件占位
├── App.vue
└── main.ts
10. 代码增加中文注释，变量命名语义化。
