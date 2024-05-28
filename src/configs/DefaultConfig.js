export default {
	/**
	 * 端口号
	 * @type {number}
	 */
	PORT: 80,
	/**
	 * Biu~ 命令
	 */
	BIU: {
		/**
		 * 获取所有提取码口令
		 * @type {string|null}
		 */
		GET_ALL_CODE_COMMAND: "/getallcode",
		/**
		 * 清除所有提取码口令
		 * @type {string|null}
		 */
		CLEAR_ALL_CODE_COMMAND: "/clearallcode",
		/**
		 * 启用虚拟控制台口令
		 * @type {string|null}
		 */
		OPEN_CONSOLE_COMMAND: "/openconsole"
	},
	/**
	 * 提取码
	 */
	CODE: {
		/**
		 * 提取码长度（单位：2字符）
		 * @type {number}
		 */
		EXTRACT_LENGTH: 1,
		/**
		 * 链接码长度（单位：2字符）
		 * @type {number}
		 */
		LINK_LENGTH: 16
	},
	STORE: {
		LINK: {
			/**
			 * 链接过期时间（单位：毫秒）
			 * @type {number}
			 */
			EXPIRE_INTERVAL: 6 * 60 * 60 * 1000
		},
		TEXT: {
			/**
			 * 文本暂存空间（单位：字节）
			 * @type {number}
			 */
			CAPACITY: 64 * 1024 * 1024,
			/**
			 * 文本过期时间（单位：毫秒）
			 * @type {number}
			 */
			EXPIRE_INTERVAL: 12 * 60 * 60 * 1000
		},
		FILE: {
			/**
			 * 文件分片大小（单位：字节）
			 * @type {number}
			 */
			PART_SIZE: 10 * 1024 * 1024,
			/**
			 * 文件暂存空间（单位：字节）
			 * @type {number}
			 */
			CAPACITY: 10 * 1024 * 1024 * 1024,
			/**
			 * 文件过期时间（单位：毫秒）
			 * @type {number}
			 */
			EXPIRE_INTERVAL: 6 * 60 * 60 * 1000,
			/**
			 * 文件上传最大时长（单位：毫秒）
			 * @type {number}
			 */
			UPLOAD_INTERVAL: 60 * 60 * 1000,
			/**
			 * 文件上传最大检查点间隔
			 * @type {number}
			 */
			UPLOAD_CHECKPOINT_INTERVAL: 60 * 1000
		},
		SHARE: {
			/**
			 * 共享文件夹路径
			 * @type {string}
			 */
			PATH: "./share",
			/**
			 * 共享文件夹提取码
			 * @type {string}
			 */
			CODE: "share"
		}
	}
};
