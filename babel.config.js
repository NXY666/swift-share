export default {
	presets: [
		[
			'@babel/preset-env',
			{
				targets: {
					browsers: [
						"supports es6-module",
						"not dead"
					]
				},
				loose: true,
				useBuiltIns: 'entry',
				corejs: "3.27"
			}
		]
	]
};
