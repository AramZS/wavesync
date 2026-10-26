import Vue from 'vue'
import Router from 'vue-router'
import Home from './pages/Home'
import Callback from './pages/Callback'
import Visualizer from './pages/Visualizer'

Vue.use(Router)

export default new Router({
  mode: 'history',
  base: process.env.BASE_URL,
  routes: [
    {
      path: '/',
      name: 'home',
      component: Home
    },
    {
      path: '/callback',
      name: 'callback',
      component: Callback
    },
    {
      path: '/visualizer',
      name: 'about',
      component: Visualizer
    }
  ]
})
