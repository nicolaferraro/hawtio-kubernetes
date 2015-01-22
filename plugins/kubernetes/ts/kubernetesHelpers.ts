/// <reference path="../../includes.ts"/>
module Kubernetes {

  export var context = '/kubernetes';
  export var hash = '#' + context;
  export var defaultRoute = hash + '/apps';
  export var pluginName = 'Kubernetes';
  export var templatePath = 'plugins/kubernetes/html/';
  export var log:Logging.Logger = Logger.get(pluginName);

  export var defaultApiVersion = "v1beta2";

  export var appSuffix = ".app";

  export interface KubePod {
    id:string;
    namespace:string;
  }

  //var fabricDomain = Fabric.jmxDomain;
  var fabricDomain = "io.fabric8";
  export var mbean = fabricDomain + ":type=Kubernetes";
  export var managerMBean = fabricDomain + ":type=KubernetesManager";
  export var appViewMBean = fabricDomain + ":type=AppView";

  export function isKubernetes(workspace) {
    // return workspace.treeContainsDomainAndProperties(fabricDomain, {type: "Kubernetes"});
    return true;
  }

  export function isKubernetesTemplateManager(workspace) {
    // return workspace.treeContainsDomainAndProperties(fabricDomain, {type: "KubernetesTemplateManager"});
    return true;
  }

  export function isAppView(workspace) {
    // return workspace.treeContainsDomainAndProperties(fabricDomain, {type: "AppView"});
    return true;
  }

  /**
   * Updates the namespaces value in the kubernetes object from the namespace values in the pods, controllers, services
   */
  export function updateNamespaces(kubernetes, pods = [], replicationControllers = [], services = []) {
    var byNamespace = (thing) => { return thing.namespace; };

    function pushIfNotExists(array, items) {
        angular.forEach(items, (value) => {
            if ($.inArray(value, array) < 0) {
              array.push(value);
            }
        });
    }
    var namespaces = [];

    pushIfNotExists(namespaces, pods.map(byNamespace));
    pushIfNotExists(namespaces, services.map(byNamespace));
    pushIfNotExists(namespaces, replicationControllers.map(byNamespace));

    namespaces = namespaces.sort();

    kubernetes.namespaces = namespaces;
    kubernetes.selectedNamespace = kubernetes.selectedNamespace || namespaces[0];
  }

  export function setJson($scope, id, collection) {
    $scope.id = id;
    if (!$scope.fetched) {
      return;
    }
    if (!id) {
      $scope.json = '';
      return;
    }
    if (!collection) {
      return;
    }
    var item = collection.find((item) => { return item.id === id; });
    if (item) {
      $scope.json = angular.toJson(item, true);
      $scope.item = item;
    } else {
      $scope.id = undefined;
      $scope.json = '';
      $scope.item = undefined;
    }
  }


  /**
   * Returns the labels text string using the <code>key1=value1,key2=value2,....</code> format
   */
  export function labelsToString(labels, seperatorText = ",") {
    var answer = "";
    angular.forEach(labels, (value, key) => {
      var separator = answer ? seperatorText : "";
      answer += separator + key + "=" + value;
    });
    return answer;
  }

  export function initShared($scope, $location) {
    // update the URL if the filter is changed
    $scope.$watch("tableConfig.filterOptions.filterText", (text) => {
      $location.search("q", text);
    });

    $scope.$on("labelFilterUpdate", ($event, text) => {
      var currentFilter = $scope.tableConfig.filterOptions.filterText;
      if (Core.isBlank(currentFilter)) {
        $scope.tableConfig.filterOptions.filterText = text;
      } else {
        var expressions = currentFilter.split(/\s+/);
        if (expressions.any(text)) {
          // lets exclude this filter expression
          expressions = expressions.remove(text);
          $scope.tableConfig.filterOptions.filterText = expressions.join(" ");
        } else {
          $scope.tableConfig.filterOptions.filterText = currentFilter + " " + text;
        }
      }
      $scope.id = undefined;
    });
  }

  /**
   * Given the list of pods lets iterate through them and find all pods matching the selector
   * and return counters based on the status of the pod
   */
  export function createPodCounters(selector, pods, outputPods = []) {
    var answer = {
      podsLink: "",
      valid: 0,
      waiting: 0,
      error: 0
    };
    if (selector) {
      answer.podsLink = Core.url("/kubernetes/pods?q=" + encodeURIComponent(Kubernetes.labelsToString(selector, " ")));
      angular.forEach(pods, pod => {
        if (selectorMatches(selector, pod.labels)) {
          outputPods.push(pod);
          var status = (pod.currentState || {}).status;

          if (status) {
            var lower = status.toLowerCase();
            if (lower.startsWith("run")) {
              answer.valid += 1;
            } else if (lower.startsWith("wait")) {
              answer.waiting += 1;
            } else if (lower.startsWith("term") || lower.startsWith("error") || lower.startsWith("fail")) {
              answer.error += 1;
            }
          } else {
            answer.error += 1;
          }
        }
      });
    }
    return answer;
  }

  /**
   * Runs the given application JSON
   */
  export function runApp($location, jolokia, $scope, json, name = "App", onSuccessFn = null, namespace = null) {
    if (json) {
      name = name || "App";
      var postfix = namespace ? " in namespace " + namespace : "";
      Core.notification('info', "Running " + name + postfix);

      var callback = Core.onSuccess((response) => {
        log.debug("Got response: ", response);
        if (angular.isFunction(onSuccessFn)) {
          onSuccessFn();
        }
        Core.$apply($scope);
      });

      if (namespace) {
        jolokia.execute(Kubernetes.managerMBean, "applyInNamespace", json, namespace, callback);
      } else {
        jolokia.execute(Kubernetes.managerMBean, "apply", json, callback);
      }
    }
  }


  /**
   * Returns true if the current status of the pod is running
   */
  export function isRunning(podCurrentState) {
    var status = (podCurrentState || {}).status;
    if (status) {
      var lower = status.toLowerCase();
      return lower.startsWith("run");
    } else {
      return false;
    }
  }

  /**
   * Returns true if the labels object has all of the key/value pairs from the selector
   */
  export function selectorMatches(selector, labels) {
    if (angular.isObject(labels)) {
      var answer = true;
      angular.forEach(selector, (value, key) => {
        if (answer && labels[key] !== value) {
          answer = false;
        }
      });
      return answer;
    } else {
      return false;
    }
  }


  /**
   * Returns a link to the kibana logs web application
   */
  export function kibanaLogsLink(ServiceRegistry) {
    var link = Service.serviceLink(ServiceRegistry, "kibana-service");
    if (link) {
      if (!link.endsWith("/")) {
        link += "/";
      }
      return link + "#/discover/Fabric8";
    } else {
      return null;
    }
  }

  export function openLogsForPods(ServiceRegistry, $window, pods) {
    function encodePodIdInSearch(id) {
      // TODO until we figure out the best encoding lets just split at the "-"
      if (id) {
        var idx = id.indexOf("-");
        if (idx > 0) {
          id = id.substring(0, idx);
        }
      }
      //var quoteText = "%27";
      var quoteText = "";
      return quoteText + id + quoteText;
    }



    var link = kibanaLogsLink(ServiceRegistry);
    if (link) {
      var query = "";
      var count = 0;
      angular.forEach(pods, (item) => {
        var id = item.id;
        if (id) {
          var space = query ? " || " : "";
          count++;
          query += space + encodePodIdInSearch(id);
        }
      });
      if (query) {
        if (count > 1) {
          query = "(" + query + ")";
        }
        link += "?_a=(query:'k8s_pod:" + query + "')";
      }
      var newWindow = $window.open(link, "viewLogs");
    }
  }

  export function resizeController($http, KubernetesApiURL, id, newReplicas, onCompleteFn = null) {
    KubernetesApiURL.then((KubernetesApiURL) => {
      var url = UrlHelpers.join(KubernetesApiURL, "/api/v1beta1/replicationControllers/" + id);
      $http.get(url).
        success(function (data, status, headers, config) {
          if (data) {
            var desiredState = data.desiredState;
            if (!desiredState) {
              desiredState = {};
              data.desiredState = desiredState;
            }
            desiredState.replicas = newReplicas;
            $http.put(url, data).
              success(function (data, status, headers, config) {
                log.debug("updated controller " + url);
                if (angular.isFunction(onCompleteFn)) {
                  onCompleteFn();
                }
              }).
              error(function (data, status, headers, config) {
                log.warn("Failed to save " + url + " " + data + " " + status);
              });
          }
        }).
        error(function (data, status, headers, config) {
          log.warn("Failed to load " + url + " " + data + " " + status);
        });
    }, (response) => {
      log.debug("Failed to get rest API URL, can't resize controller " + id + " resource: ", response);
    });
  }

  export function statusTextToCssClass(text) {
    if (text) {
      var lower = text.toLowerCase();
      if (lower.startsWith("run") || lower.startsWith("ok")) {
        return 'icon-play-circle green';
      } else if (lower.startsWith("wait")) {
        return 'icon-download';
      } else if (lower.startsWith("term") || lower.startsWith("error") || lower.startsWith("fail")) {
        return 'icon-off orange';
      }
    }
    return 'icon-question red';
  }

  export function createAppViewPodCounters(appView) {
    var array = [];
    var map = {};
    var pods = appView.pods;
    var lowestDate = null;
    angular.forEach(pods, pod => {
      var selector = pod.labels;
      var selectorText = Kubernetes.labelsToString(selector, " ");
      var answer = map[selector];
      if (!answer) {
        answer = {
          labelText: selectorText,
          podsLink: Core.url("/kubernetes/pods?q=" + encodeURIComponent(selectorText)),
          valid: 0,
          waiting: 0,
          error: 0
        };
        map[selector] = answer;
        array.push(answer);
      }
      var status = pod.status;
      if ("OK" === status) {
        answer.valid += 1;
      } else if ("WAIT" === status) {
        answer.waiting += 1;
      } else {
        answer.error += 1;
      }
      var creationTimestamp = pod.creationTimestamp;
      if (creationTimestamp) {
        var d = new Date(creationTimestamp);
        if (!lowestDate || d < lowestDate) {
          lowestDate = d;
        }
      }
    });
    appView.$creationDate = lowestDate;
    return array;
  }

  export function createAppViewServiceViews(appView) {
    var array = [];
    var pods = appView.pods;
    angular.forEach(pods, pod => {
      var id = pod.id;
      if (id) {
        var abbrev = id;
        var idx = id.indexOf("-");
        if (idx > 1) {
          abbrev = id.substring(0, idx);
        }
        pod.idAbbrev = abbrev;
      }
      pod.statusClass = statusTextToCssClass(pod.status);
    });

    var services = appView.services || [];
    var replicationControllers = appView.replicationControllers || [];
    var size = Math.max(services.length, replicationControllers.length, 1);
    var appName = appView.$info.name;
    for (var i = 0; i < size; i++) {
      var service = services[i];
      var replicationController = replicationControllers[i];
      var controllerId = (replicationController || {}).id;
      var name = (service || {}).id || controllerId;
      var address = (service || {}).portalIP;
      if (!name && pods.length) {
        name = pods[0].idAbbrev;
      }
      if (!appView.$info.name) {
        appView.$info.name = name;
      }
      if (!appView.id && pods.length) {
        appView.id = pods[0].id;
      }
      if (i > 0) {
        appName = name;
      }
      var podCount = pods.length;
      var podCountText = podCount + " pod" + (podCount > 1 ? "s" : "");
      var view = {
        appName: appName || name,
        name: name,
        createdDate: appView.$creationDate,
        podCountText: podCountText,
        address: address,
        controllerId: controllerId,
        service: service,
        replicationController: replicationController,
        pods: pods
      };
      array.push(view);
    }
    return array;
  }

}
