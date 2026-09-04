import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    component: () => import('../views/Layout.vue'),
    children: [
      {
        path: '',
        name: 'HomeLedger',
        component: () => import('../views/Ledger.vue'),
        meta: { title: '发票台账' }
      },
      {
        path: 'ledger',
        name: 'Ledger',
        component: () => import('../views/Ledger.vue'),
        meta: { title: '发票台账' }
      },
      {
        path: 'upload',
        name: 'Upload',
        component: () => import('../views/Upload.vue'),
        meta: { title: 'XML批量上传' }
      },
      {
        path: 'pedimento-upload',
        name: 'PedimentoUpload',
        component: () => import('../views/PedimentoUpload.vue'),
        meta: { title: '关单PDF入库' }
      },
      {
        path: 'mapping',
        name: 'Mapping',
        component: () => import('../views/Mapping.vue'),
        meta: { title: 'SAP客商映射' }
      },
      {
        path: 'summary',
        name: 'Summary',
        component: () => import('../views/Summary.vue'),
        meta: { title: '汇总报表' }
      },
      {
        path: 'detail',
        name: 'Detail',
        component: () => import('../views/DetailBreakdown.vue'),
        meta: { title: '余额构成明细' }
      }
    ]
  }
]

const router = createRouter({
  // Hash history works with static hosting: every URL resolves to index.html.
  history: createWebHashHistory(),
  routes
})

export default router
