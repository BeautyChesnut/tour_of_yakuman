Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    title: {
      type: String,
      value: "算点结果"
    },
    han: {
      type: Number,
      value: 0
    },
    fu: {
      type: Number,
      value: 0
    },
    basePoints: {
      type: Number,
      value: 0
    },
    warnings: {
      type: Array,
      value: []
    },
    result: {
      type: Object,
      value: {}
    }
  }
});
