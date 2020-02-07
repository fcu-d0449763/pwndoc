import { Dialog, Notify } from 'quasar'
import Vue from 'vue'
import YAML from 'js-yaml'

import VulnerabilityService from '@/services/vulnerability'
import UserService from '@/services/user'

export default {
    data: () => {
        return {
            UserService: UserService,
            vulnerabilities: [],
        }
    },

    mounted: function() {
        
    },

    methods: {
        getVulnerabilities: function() {
            this.vulnerabilities = [];
            VulnerabilityService.exportVulnerabilities()
            .then((data) => {
                this.vulnerabilities = data.data.datas;
                this.downloadVulnerabilities();
            })
            .catch((err) => {
                console.log(err)
            })
        },

        createVulnerabilities: function() {
            VulnerabilityService.createVulnerabilities(this.vulnerabilities)
            .then((data) => {
                var message = "";
                var color = "positive";
                if (data.data.datas.duplicates === 0) {
                    message = `All <strong>${data.data.datas.created}</strong> vulnerabilities created`;
                }
                else if (data.data.datas.created === 0 && data.data.datas.duplicates > 0) {
                    message = `All <strong>${data.data.datas.duplicates}</strong> vulnerabilities title already exist`;
                    color = "negative";
                }
                else {
                    message = `<strong>${data.data.datas.created}</strong> vulnerabilities created<br /><strong>${data.data.datas.duplicates}</strong> vulnerabilities title already exist`;
                    color = "orange";
                }
                Notify.create({
                    message: message,
                    html: true,
                    closeBtn: 'x',
                    color: color,
                    textColor:'white',
                    position: 'top-right'
                })
            })
            .catch((err) => {
                Notify.create({
                    message: err.response.data.datas,
                    color: 'negative',
                    textColor: 'white',
                    position: 'top-right'
                })
            })
        },

        importVulnerabilities: function(files) {
            this.vulnerabilities = [];
            var pending = 0;
            for (var i=0; i<files.length; i++) {
                ((file) => {
                    var fileReader = new FileReader();
                    fileReader.onloadend = (e) => {
                        var vulnFile;
                        var ext = file.name.split('.').pop();
                        if (ext === "yml") {
                            try {
                                vulnFile = YAML.safeLoad(fileReader.result);
                                if (typeof vulnFile === 'object') {
                                    if (Array.isArray(vulnFile)) {
                                        this.vulnerabilities = vulnFile;
                                    }
                                    else
                                        this.vulnerabilities.push(vulnFile);
                                }
                                else
                                    throw new Error ('Invalid YAML format detected')
                            }
                            catch(err) {
                                console.log(err);
                                var errMsg = err;
                                if (err.mark) errMsg = `Parsing Error: line ${err.mark.line}, column: ${err.mark.column}`;
                                Notify.create({
                                    message: errMsg,
                                    color: 'negative',
                                    textColor: 'white',
                                    position: 'top-right'
                                })
                                return;
                            }
                        }
                        else if (ext === "json") {
                            try {
                                vulnFile = JSON.parse(fileReader.result);
                                if (typeof vulnFile === 'object') {
                                    if (Array.isArray(vulnFile)) {
                                        if (vulnFile.length > 0 && vulnFile[0].id)
                                            this.vulnerabilities = this.parseSerpico(vulnFile);
                                        else
                                            this.vulnerabilities = vulnFile;
                                    }
                                    else
                                        this.vulnerabilities.push(vulnFile);
                                }
                                else
                                    throw new Error ('Invalid JSON format detected')
                            }
                            catch(err) {
                                console.log(err);
                                var errMsg = err;
                                if (err.message) errMsg = `Parsing Error: ${err.message}`;
                                Notify.create({
                                    message: errMsg,
                                    color: 'negative',
                                    textColor: 'white',
                                    position: 'top-right'
                                })
                                return;
                            }
                        }
                        else
                            console.log('Bad Extension')
                        pending--;
                        if (pending === 0) this.createVulnerabilities();
                    }
                    pending++;
                    fileReader.readAsText(file);
                })(files[i])
            }
        },

        parseSerpico: function(vulnerabilities) {
            var result = [];
            vulnerabilities.forEach(vuln => {
                var tmpVuln = {};
                tmpVuln.cvssv3 = vuln.c3_vs || null;
                tmpVuln.cvssScore = vuln.cvss_base_score || null;
                tmpVuln.cvssSeverity = vuln.severity || null;
                tmpVuln.priority = null;
                tmpVuln.remediationComplexity = null;
                tmpVuln.references = this.formatSerpicoText(vuln.references);
                var details = {};
                details.locale = this.formatSerpicoText(vuln.language);
                details.title = this.formatSerpicoText(vuln.title);
                details.vulnType = this.formatSerpicoText(vuln.type);
                details.description = this.formatSerpicoText(vuln.overview);
                details.observation = this.formatSerpicoText(vuln.poc);
                details.remediation = this.formatSerpicoText(vuln.remediation);
                tmpVuln.details = [details];
                
                result.push(tmpVuln);
            });
            
            return result;
        },

        formatSerpicoText: function(str) {
            if (str === null) return null
            if (str === 'English') return 'en'
            if (str === 'French') return 'fr'

            var res = str
            // Replace the paragraph tags and simply add linebreaks
            res = res.replace(/<paragraph>/g, '')
            res = res.replace(/<\/paragraph>/g, '\n')
            // First level bullets
            res = res.replace(/<bullet>/g, '* ')
            res = res.replace(/<\/bullet>/g, '')
            // Nested bullets
            res = res.replace(/<bullet1>/g, '    * ')
            res = res.replace(/<\/bullet1>/g, '')
            // Headers (used as bold in Serpico)
            res = res.replace(/<h4>/g, '')
            res = res.replace(/<\/h4>/g, '')
            // Indented text
            res = res.replace(/<indented>/g, '    ')
            res = res.replace(/<\/indented>/g, '')
            // Italic
            res = res.replace(/<italics>/g, '')
            res = res.replace(/<\/italics>/g, '')
            // Code
            res = res.replace(/\[\[\[/g, '\n')
            res = res.replace(/]]]/g, '\n')
            // Apostroph
            res = _.unescape(res)

            return res
        },

        downloadVulnerabilities: function() {
            var data = YAML.safeDump(this.vulnerabilities);
            var blob = new Blob([data], {type: 'application/yaml'});
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = "vulnerabilities.yml";
            a.click();
            URL.revokeObjectURL(url);
            
        }
    }
}