import Visualizer from './visualizer'

export default class Template extends Visualizer {
  constructor () {
    super({ volumeSmoothing: 50 })
  }

  hooks () {
    this.sync.on('tatum', () => {

    })

    this.sync.on('segment', () => {

    })

    this.sync.on('beat', () => {

    })

    this.sync.on('bar', () => {

    })

    this.sync.on('section', () => {

    })
  }

  paint () {
    // Template stub: no rendering yet. Subclasses override paint() with the
    // ({ ctx, height, width, now }) signature to draw each frame.
  }
}