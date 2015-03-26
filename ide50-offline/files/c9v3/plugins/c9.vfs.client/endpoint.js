define(function(require, exports, module) {
    "use strict";
    
    main.consumes = ["Plugin", "auth", "http", "api"];
    main.provides = ["vfs.endpoint"];
    return main;

    function main(options, imports, register) {
        var Plugin = imports.Plugin;
        var auth = imports.auth;
        var http = imports.http;
        var api = imports.api;
        
        /***** Initialization *****/

        var plugin = new Plugin("Ajax.org", main.consumes);
        var emit = plugin.getEmitter();

        var urlServers;
        var query = require("url").parse(document.location.href, true).query;
        if (query.vfs) {
            if (!query.vfs.match(/^https:\/\/.*\/vfs$/))
                alert("Bad VFS URL passed, expected: https://host/vfs");
            urlServers = [{
                url: query.vfs,
                region: "url"
            }];
        }
        if (query.vfs || query.region) {
            var vfs = recallVfs();
            if (vfs) {
                if (query.vfs && query.vfs !== vfs.url)
                    deleteOldVfs();
                else if (query.region && query.region !== vfs.region)
                    deleteOldVfs();
            }
        }
        if (query.vfs)
            options.updateServers = false;
            
        var region = query.region || options.region;

        var servers;
        var pendingServerReqs = [];
        
        if (options.getServers)
            options.getServers(initDefaultServers);
        else
            initDefaultServers();
        
        options.pid = options.pid || 1;
        
        /***** Methods *****/
        
        function initDefaultServers(baseURI) {
            options.getServers = undefined;
            var loc = require("url").parse(baseURI || document.baseURI || window.location.href);
            var defaultServers = [{
                url: loc.protocol + "//" + loc.hostname + (loc.port ? ":" + loc.port : "") + "/vfs",
                region: "default"
            }];
            servers = (urlServers || options.servers || defaultServers).map(function(server) {
                server.url = server.url.replace(/\/*$/, "");
                return server;
            });
            pendingServerReqs.forEach(function(cb) {
                cb(null, servers);
            });
        }

        function getServers(callback) {
            if (typeof options.getServers == "function")
                return pendingServerReqs.push(callback);
            
            if (!options.updateServers)
                return callback(null, servers);
                
            // first time take the ones from the options
            var _servers = servers;
            if (_servers) {
                servers = null;
                return callback(null, _servers);
            }
                
            api.vfs.get("servers", function(err, servers) {
                if (err) return callback(err);
                
                return callback(null, servers.servers); 
            });
        }

        function getVfsEndpoint(version, callback) {
            getServers(function(err, servers) {
                if (err) return callback(err);
                
                getVfsUrl(version, servers, function(err, url) {
                    if (err) return callback(err);
    
                    callback(null, {
                        home: url + "/home",
                        project: url + "/workspace",
                        socket: url + "/socket",
                        ping: url,
                        serviceUrl: url,
                    });
                });
            });
        }

        function isOnline(callback) {
            http.request("/_ping", {
                timeout: 3000,
                headers: {
                    Accept: "application/json"
                }
            }, function(err, data, res) {
                callback(err, !err);
            });
        }

        function isServerAlive(url, callback) {
            auth.request(url, {
                headers: {
                    Accept: "application/json"
                }
            }, function(err, data, res) {
                if (err)
                    deleteOldVfs();

                callback(err, !err);
            });
        }

        function getVfsUrl(version, vfsServers, callback) {
            var vfs = recallVfs();

            if (vfs && vfs.vfsid) {
                auth.request(vfs.vfsid, {
                    method: "GET",
                    headers: {
                        Accept: "application/json"
                    }
                }, function(err, res) {
                    if (err) {
                        deleteOldVfs();
                        return getVfsUrl(version, vfsServers, callback);
                    }
                    callback(null, vfs.vfsid);
                });
                return;
            }

            var servers = shuffleServers(vfsServers);
            
            // check for version
            if (servers.length && !servers.filter(function(s) { return s.version !== version; }).length)
                return onProtocolChange(callback);

            // just take the first server that doesn't return an error
            (function tryNext(i) {
                if (i >= servers.length)
                    return callback(new Error("Disconnected: Could not reach your workspace. Please try again later."));

                var server = servers[i];

                auth.request(server.url + "/" + options.pid, {
                    method: "POST",
                    timeout: 120000,
                    body: {
                        version: version
                    },
                    headers: {
                        Accept: "application/json"
                    }
                }, function(err, res) {
                    // the workspace is not configured correctly
                    if (err && res && res.error) {
                        if (err.code == 429) {
                            // rate limited
                            setTimeout(function() {
                                tryNext(i);
                            }, res.error.retryIn || 10000);
                            return;
                        }
                        else if (err.code == 412 && res.error && res.error.subtype == "protocol_mismatch") {
                            return onProtocolChange(callback);
                        }
                        else if (err.code == 412) {
                            callback(fatalError(res.error.message, "dashboard"));
                            return;
                        }
                        else if (err.code === 428 && res.error) {
                            emit("restore", {
                                projectState: res.error.projectState,
                                premium: res.error.premium,
                                progress: res.error.progress || {
                                    progress: 0,
                                    nextProgress: 0,
                                    message: ""
                                }
                            });
                            setTimeout(function() {
                                tryNext(i);
                            }, res.error.retryIn || 10000);
                            return;
                        }
                        else if (err.code == 403) {
                            // forbidden. User doesn't have access
                            // wait a while before trying again
                            setTimeout(function() {
                                tryNext(i);
                            }, 10000);
                            return;
                        }
                    }

                    if (err) {
                        setTimeout(function() {
                            tryNext(i+1);
                        }, 2000);
                        return;
                    }

                    var vfs = rememberVfs(server, res.vfsid);
                    callback(null, vfs.vfsid);
                });
            })(0);
        }

        function onProtocolChange(callback) {
            // I'm keeping this vague because we don't want users to blame
            // a "cloud9 update" for losing work
            deleteOldVfs();
            return callback(fatalError("Protocol change detected", "reload"));
        }

        function shuffleServers(servers) {
            servers = servers.slice();
            var isBeta = region == "beta";
            servers = servers.filter(function(s) {
                return isBeta || s.region !== "beta";
            });
            return servers.sort(function(a, b) {
                if (a.region == b.region) {
                    if (a.load < b.load)
                        return -1;
                    else
                        return 1;
                }
                else if (a.region == region)
                    return -1;
                else if (b.region == region)
                    return 1;
                else
                    return 0;
            });
        }

        function rememberVfs(server, vfsid) {
            var vfs = {
                url: server.url,
                region: server.region,
                pid: options.pid,
                vfsid: server.url + "/" + options.pid + "/" + vfsid,
                readonly: options.readonly
            };

            var data = JSON.stringify(vfs);
            var oldData = window.sessionStorage.getItem("vfsid");
            if (oldData && oldData !== data)
                deleteOldVfs();

            try {
                window.sessionStorage.setItem("vfsid", data);
            } catch(e) {
                // could throw a quota exception
            } 
            return vfs;
        }

        function recallVfs() {
            var vfs;
            try {
                vfs = JSON.parse(window.sessionStorage.getItem("vfsid"));
            } catch (e) {}

            if (!vfs)
                return null;

            if (vfs.pid !== options.pid || vfs.readonly != options.readonly) {
                deleteOldVfs();
                return null;
            }

            return vfs;
        }

        function deleteOldVfs() {
            var vfs;
            try {
                vfs = JSON.parse(window.sessionStorage.getItem("vfsid"));
            } catch (e) {}

            window.sessionStorage.removeItem("vfsid");
            if (!vfs) return;

            auth.request(vfs.vfsid, {
                method: "DELETE",
                headers: {
                    Accept: "application/json"
                }
            }, function(err) {
                if (err) console.error(vfs.vfsid, "deleted", err);
                });
        }

        function fatalError(msg, action) {
            var err = new Error(msg);
            err.fatal = true;
            err.action = action || "reload";
            return err;
        }

        /***** Register and define API *****/

        /**
         **/
        plugin.freezePublicAPI({
            /**
             * Returns the URLs for the home and project REST API and the socket
             */
            get: getVfsEndpoint,

            /**
             * Checks if the client has a network connection
             */
            isOnline: isOnline,
            
            /**
             * 
             */
            clearCache: deleteOldVfs,
            
            /**
             * Checks if the current VFS server is still alive
             */
            isServerAlive: isServerAlive
        });

        register(null, {
            "vfs.endpoint": plugin
        });
    }
});