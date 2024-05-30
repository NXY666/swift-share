interface BiuCommands {
	GET_ALL_CODE_COMMAND: string;
	CLEAR_ALL_CODE_COMMAND: string;
	OPEN_CONSOLE_COMMAND: string;
}

interface CodeConfig {
	EXTRACT_LENGTH: number;
	LINK_LENGTH: number;
}

interface StoreLinkConfig {
	EXPIRE_INTERVAL: number;
}

interface StoreTextConfig {
	CAPACITY: number;
	EXPIRE_INTERVAL: number;
}

interface StoreFileConfig {
	PART_SIZE: number;
	CAPACITY: number;
	EXPIRE_INTERVAL: number;
	UPLOAD_INTERVAL: number;
	UPLOAD_CHECKPOINT_INTERVAL: number;
}

interface StoreShareConfig {
	PATH: string;
	CODE: string;
}

interface StoreConfig {
	LINK: StoreLinkConfig;
	TEXT: StoreTextConfig;
	FILE: StoreFileConfig;
	SHARE: StoreShareConfig;
}

export interface ConfigType {
	PORT: number;
	BIU: BiuCommands;
	CODE: CodeConfig;
	STORE: StoreConfig;
}
