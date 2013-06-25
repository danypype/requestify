/**
 * Module dependencies
 */
var _ = require('underscore'),
    http = require('http'),
    Request = require('./Request.js'),
    Response = require('./Response.js'),
    Q = require('q'),
    cache = require('./Cache'),
    https = require('https');

var Requestify = (function(global, undefined) {
    'use strict';

    /**
     * The response encoding
     * @type {string}
     */
    var responseEncoding = 'utf8',

        /**
         * Module API
         */
        api;

    /**
     * Returns http|s instance according to the given protocol
     * @param protocol
     * @returns {http|https}
     */
    function getHttp(protocol) {
        if (protocol === 'https:') {
            return https;
        }

        return http;
    }

    /**
     * Is the request was successful or not
     * @param {number} code
     * @returns {boolean}
     */
    function isSuccessful(code) {
        return code >= 200 && code < 300;
    }

    /**
     * Executes the given request object.
     * @param {Request} request
     * @param {Q.defer} defer
     */
    function call(request, defer) {
        var httpRequest,
            options,
            http = getHttp(request.getProtocol()),
            timeout;

        // Define options according to Request object interface
        options = {
            hostname: request.getHost(),
            path: request.getUri(),
            port: request.getPort(),
            method: request.method,
            auth: request.getAuthorization(),
            headers: request.getHeaders()
        };

        if (request.method === 'GET') {
            cache.get(request.getFullUrl()).then(function(data) {

            });
        }

         /**
         * Handle request callback
         */
        httpRequest = http.request(options, function(res) {
            clearTimeout(timeout);
            var response = new Response(res.statusCode, res.headers);

            res.setEncoding(responseEncoding);
            res.on('data', function(chunk) {
                response.setChunk(chunk);
            });

            res.on('end', function() {
                if (isSuccessful(response.code)) {
                    cache.set(request.getFullUrl(), {
                        code: response.getCode(),
                        headers: response.getHeaders(),
                        body: response.getBody(),
                        created: new Date().getTime()
                    });
                    defer.resolve(response);
                    return;
                }

                defer.reject(response);
            });
        });

        /**
         * Abort and reject on timeout
         */
        timeout = setTimeout(function() {
            httpRequest.abort();
            defer.reject('Timeout exceeded');
        }, request.timeout);

        /**
         * Reject on error and pass the given error object
         */
        httpRequest.on('error', function(error) {
            defer.reject(error);
            console.log(error);
        });

        httpRequest.end(request.getBody());

        return defer.promise;
    }


    /**
     * Request router, handles caching
     * @param {Request} request
     * @returns {Q.promise}
     */
    function callRouter(request) {
        var defer = Q.defer();

        if (request.method !== 'GET' || request.cache.cache === false) {
            return call(request, defer);
        }

        /**
         * Get the cache and serve if available
         */
        cache.get(request.getFullUrl())
            .then(function(data) {
                if (!data || (data.created + request.cache.expires > new Date().getTime())) {
                    call(request, defer);
                    return;
                }

                defer.resolve(new Response(data.code, data.headers, data.body));
        })
            .fail(function() {
                call(request, defer);
            }
        );

        return defer.promise;
    }

    /**
     * Module API
     * @type {{request: Function, responseEncoding: Function, get: Function, post: Function, put: Function, delete: Function, head: Function }}
     */
    api = {
        /**
         * Execute HTTP request based on the given method and body
         * @param {string} url - The URL to execute
         * @param {{ method: string, dataType: string, headers: object, body: object, cookies: object, auth: object }} options
         * @returns {Q.promise} - Returns a promise, once resolved || rejected, Response object is given
         */
        request: function(url, options) {
            return callRouter(new Request(url, options));
        },

        /**
         * Getter/setter for the response encoding
         * @param {string} value
         * @returns {string|Requestify}
         */
        responseEncoding: function(value) {
            if (!value) {
                return responseEncoding;
            }

            responseEncoding = value;
            return this;
        },

        /**
         * Getter/Setter for the redis instance
         * @param {Redis} redisInstance
         */
        redis: function(redisInstance) {
            if (!redisInstance) {
                return;
            }

            cache.setRedis(redisInstance);
        }
    };

    /**
     * Short methods generator
     */
    (function createShortMethods(names) {
        names.forEach(function(name) {
            api[name] = function(url, options) {
                options.method = name.toUpperCase();

                return api.request(url, options);
            };
        });
    }(['get', 'delete', 'head']));

    /**
     * Short methods with data generator
     */
    (function createShortMethodsWithData(names) {
        names.forEach(function(name) {
            api[name] = function(url, data, options) {
                options.method = name.toUpperCase();
                options.body = data;

                return api.request(url, options);
            };
        });
    }(['post', 'put']));

    return api;
}(global));

module.exports = Requestify;