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
	 * 提取码长度（单位：2字符）
	 * @type {number}
	 */
	EXTRACT_CODE_LENGTH: 1,
	/**
	 * 链接码长度（单位：2字符）
	 * @type {number}
	 */
	LINK_CODE_LENGTH: 16,
	/**
	 * 共享文件夹路径
	 * @type {string}
	 */
	SHARE_FOLDER_PATH: "./share",
	/**
	 * 文本暂存空间（单位：字节）
	 * @type {number}
	 */
	TEXT_STORE_CAPACITY: 64 * 1024 * 1024,
	/**
	 * 文件暂存空间（单位：字节）
	 * @type {number}
	 */
	FILE_STORE_CAPACITY: 10 * 1024 * 1024 * 1024,
	/**
	 * 文本过期时间（单位：毫秒）
	 * @type {number}
	 */
	TEXT_EXPIRE_INTERVAL: 12 * 60 * 60 * 1000,
	/**
	 * 文件过期时间（单位：毫秒）
	 * @type {number}
	 */
	FILE_EXPIRE_INTERVAL: 6 * 60 * 60 * 1000,
	/**
	 * 文件上传最大时长（单位：毫秒）
	 * @type {number}
	 */
	FILE_UPLOAD_INTERVAL: 60 * 60 * 1000,
	/**
	 * 文件上传最大检查点间隔
	 * @type {number}
	 */
	FILE_UPLOAD_CHECKPOINT_INTERVAL: 60 * 1000,
	/**
	 * 文件分片大小（单位：字节）
	 * @type {number}
	 */
	FILE_PART_SIZE: 10 * 1024 * 1024,
	/**
	 * 链接过期时间（单位：毫秒）
	 * @type {number}
	 */
	LINK_EXPIRE_INTERVAL: 6 * 60 * 60 * 1000
};