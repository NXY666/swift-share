export default {
	presets: [
		[
			'@babel/preset-env',
			{
				targets: '> 0.01%, not dead',
				useBuiltIns: 'entry',
				corejs: 3
			}
		]
	]
};
