import path from "path";
import {fileURLToPath, pathToFileURL} from "url";
import DefaultConfig from "@/default_config";

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

interface ConfigType {
	PORT: number;
	BIU: BiuCommands;
	CODE: CodeConfig;
	STORE: StoreConfig;
}

function getAbsPath(Path = "", baseDir = fileURLToPath(import.meta.url)) {
	return path.isAbsolute(Path) ? Path : path.join(baseDir, Path);
}
function deepMergeObject<T>(def: T, act: T): T {
	if (typeof def == "undefined" || def == null) {
		return act;
	} else if (typeof act == "undefined" || act == null) {
		return def;
	}

	if (typeof def !== "object" || typeof act !== "object") {
		return typeof def !== typeof act ? def : act;
	} else if (Array.isArray(def) !== Array.isArray(act)) {
		return def;
	} else if (Array.isArray(def) && Array.isArray(act)) {
		return def.concat(act) as T;
	}

	let res: any = {};
	for (let k in def) {
		res[k] = deepMergeObject(def[k], act[k]);
	}
	for (let k in act) {
		res[k] = deepMergeObject(def[k], act[k]);
	}
	return res;
}

// 定义路径
export const DataDirPath = path.join(process.platform === "win32" ? process.env.APPDATA : process.env.HOME, './.swift-share');

export const DefaultConfigPath = './default_config.js';
export const ConfigPath = './config.js';
export const ResourcePath = './assets';
export const FilePath = './files';

export const DefaultConfigAbsolutePath = getAbsPath(DefaultConfigPath);
export const ConfigAbsolutePath = getAbsPath(ConfigPath, DataDirPath);
export const ResourceAbsolutePath = getAbsPath(ResourcePath);
export const FileAbsolutePath = getAbsPath(FilePath, DataDirPath);

let config: ConfigType;
export async function getConfig(): Promise<ConfigType> {
	if (!config) {
		config = deepMergeObject(DefaultConfig, await import(pathToFileURL(ConfigAbsolutePath).toString()));
	}
	return config;
}