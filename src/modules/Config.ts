import path from "path";
import {pathToFileURL} from "url";
import fs from "fs";
import {ConfigType} from "@/configs/ConfigType";

function getAbsPath(Path = "", baseDir = import.meta.dirname) {
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
export const DataDirPath = path.join(process.platform === "win32" ? process.env.APPDATA : process.env.HOME, '.swift-share');

export const DefaultConfigPath = './default.config.js';
export const ConfigPath = './config.mjs';
export const ResourcePath = './assets';
export const FilePath = './files';

export const DefaultConfigAbsolutePath = getAbsPath(DefaultConfigPath);
export const ConfigAbsolutePath = getAbsPath(ConfigPath, DataDirPath);
export const ResourceAbsolutePath = getAbsPath(ResourcePath);
export const FileAbsolutePath = getAbsPath(FilePath, DataDirPath);

if (!fs.existsSync(ConfigAbsolutePath)) {
	fs.cpSync(DefaultConfigAbsolutePath, ConfigAbsolutePath);
}

const config: ConfigType = deepMergeObject(await import("@/configs/DefaultConfig"), (await import(pathToFileURL(ConfigAbsolutePath).toString())).default);

export function getConfig(): ConfigType {
	return config;
}

export async function resetConfig() {
	fs.rmSync(ConfigAbsolutePath);
	fs.cpSync(DefaultConfigAbsolutePath, ConfigAbsolutePath);
}