// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { BaseError, Guards, NotImplementedError } from "@gtsc/core";
import type { EntityCondition, SortDirection } from "@gtsc/entity";
import { nameof } from "@gtsc/nameof";
import type { IRequestContext } from "@gtsc/services";
import { LoggingConnectorFactory } from "../factories/loggingConnectorFactory";
import type { ILogEntry } from "../models/ILogEntry";
import type { ILoggingConnector } from "../models/ILoggingConnector";
import type { ILoggingLevelsConfig } from "../models/ILoggingLevelsConfig";
import type { LogLevel } from "../models/logLevel";

/**
 * Class for performing logging operations on multiple connectors.
 */
export class MultiLoggingConnector implements ILoggingConnector {
	/**
	 * Runtime name for the class.
	 * @internal
	 */
	private static readonly _CLASS_NAME: string = nameof<MultiLoggingConnector>();

	/**
	 * The connectors to send the log entries to.
	 */
	private readonly _loggingConnectors: ILoggingConnector[];

	/**
	 * The log levels to display, will default to all.
	 */
	private readonly _levels: LogLevel[];

	/**
	 * Create a new instance of MultiLoggingConnector.
	 * @param options The options for the connector.
	 * @param options.loggingConnectorTypes The logging connectors to multiplex.
	 * @param options.config The configuration for the logging connector.
	 */
	constructor(options: {
		loggingConnectorTypes: string[];
		config?: ILoggingLevelsConfig | undefined;
	}) {
		Guards.object(MultiLoggingConnector._CLASS_NAME, nameof(options), options);
		Guards.arrayValue(
			MultiLoggingConnector._CLASS_NAME,
			nameof(options.loggingConnectorTypes),
			options.loggingConnectorTypes
		);
		this._levels = options?.config?.levels ?? ["debug", "info", "warn", "error", "trace"];
		this._loggingConnectors = options.loggingConnectorTypes.map(t =>
			LoggingConnectorFactory.get(t)
		);
	}

	/**
	 * Log an entry to the connector.
	 * @param requestContext The context for the request.
	 * @param logEntry The entry to log.
	 * @returns Nothing.
	 */
	public async log(requestContext: IRequestContext, logEntry: ILogEntry): Promise<void> {
		Guards.object<IRequestContext>(
			MultiLoggingConnector._CLASS_NAME,
			nameof(requestContext),
			requestContext
		);
		Guards.stringValue(
			MultiLoggingConnector._CLASS_NAME,
			nameof(requestContext.tenantId),
			requestContext.tenantId
		);
		Guards.object<ILogEntry>(MultiLoggingConnector._CLASS_NAME, nameof(logEntry), logEntry);

		if (this._levels.includes(logEntry.level)) {
			logEntry.ts ??= Date.now();

			await Promise.allSettled(
				this._loggingConnectors.map(async loggingConnector =>
					loggingConnector.log(requestContext, logEntry)
				)
			);
		}
	}

	/**
	 * Query the log entries.
	 * @param requestContext The context for the request.
	 * @param conditions The conditions to match for the entities.
	 * @param sortProperties The optional sort order.
	 * @param properties The optional keys to return, defaults to all.
	 * @param cursor The cursor to request the next page of entities.
	 * @param pageSize The maximum number of entities in a page.
	 * @returns All the entities for the storage matching the conditions,
	 * and a cursor which can be used to request more entities.
	 * @throws NotImplementedError if the implementation does not support retrieval.
	 */
	public async query(
		requestContext: IRequestContext,
		conditions?: EntityCondition<ILogEntry>,
		sortProperties?: {
			property: keyof ILogEntry;
			sortDirection: SortDirection;
		}[],
		properties?: (keyof ILogEntry)[],
		cursor?: string,
		pageSize?: number
	): Promise<{
		/**
		 * The entities, which can be partial if a limited keys list was provided.
		 */
		entities: Partial<ILogEntry>[];
		/**
		 * An optional cursor, when defined can be used to call find to get more entities.
		 */
		cursor?: string;
		/**
		 * Number of entities to return.
		 */
		pageSize?: number;
		/**
		 * Total entities length.
		 */
		totalEntities: number;
	}> {
		// See if we can find a connector that supports querying.
		// If it throws anything other than not implemented, we should throw it.
		for (const loggingConnector of this._loggingConnectors) {
			try {
				const result = await loggingConnector.query(
					requestContext,
					conditions,
					sortProperties,
					properties,
					cursor,
					pageSize
				);
				return result;
			} catch (error) {
				if (!BaseError.isErrorName(error, NotImplementedError.CLASS_NAME)) {
					throw error;
				}
			}
		}

		throw new NotImplementedError(MultiLoggingConnector._CLASS_NAME, "query");
	}
}
