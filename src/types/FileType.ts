import crypto from "crypto";

export type DownloadConfig = {
	id: ObjectKey;
	name: string;
	size: number;
	downUrl: string;
	playUrl: string;
	removed: boolean;
}

type UploadPart = {
	index: number;
	range?: [number, number];
}

export type UploadConfig = {
	id: ObjectKey;
	key: crypto.UUID;
	name: string;
	parts: UploadPart[];
}
