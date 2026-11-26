import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
    { path: '/projects/:slug', name: 'project', component: () => import('./views/ProjectView.vue'), props: true },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: (to, _from, saved) => saved ?? (to.hash ? { el: to.hash, top: 96, behavior: 'smooth' } : { top: 0 }),
})
