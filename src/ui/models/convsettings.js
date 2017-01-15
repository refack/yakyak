let exp;
const entity = require('./entity');

module.exports = exp = {
    // This handles the data of conversation add / edit
    // where you can specify participants conversation name, etc
    searchedEntities: [],
    selectedEntities: [],
    initialName: null,
    initialSearchQuery: null,
    name: "",
    searchQuery: "",
    id: null,
    group: false,

    setSearchedEntities(entities) {
        this.searchedEntities = entities || [];
        return updated('searchedentities');
    },

    addSelectedEntity(entity) {
        const id = __guard__(entity.id, x => x.chat_id) || entity; // may pass id directly
        const exists = (Array.from(this.selectedEntities).filter((e) => e.id.chat_id === id).map((e) => e)).length !== 0;
        if (!exists) {
            this.selectedEntities.push(entity);
            this.group = this.selectedEntities.length > 1;
            return updated('convsettings');
        }
    },

    removeSelectedEntity(entity) {
        const id = __guard__(entity.id, x => x.chat_id) || entity; // may pass id directly
        // if the conversation we are editing is one to one we don't want
        // to remove the selected entity
        this.selectedEntities = (Array.from(this.selectedEntities).filter((e) => e.id.chat_id !== id).map((e) => e));
        this.group = this.selectedEntities.length > 1;
        return updated('selectedEntities');
    },

    setSelectedEntities(entities) {
        this.group = entities.length > 1;
        return this.selectedEntities = entities || []; // no need to update
    },
    
    setGroup(val) { this.group = val; return updated('convsettings'); },

    setInitialName(name) { return this.initialName = name; },
    getInitialName() { const v = this.initialName; this.initialName = null; return v; },

    setInitialSearchQuery(query) { return this.initialSearchQuery = query; },
    getInitialSearchQuery() { const v = this.initialSearchQuery; this.initialSearchQuery = null; return v; },

    setName(name) { return this.name = name; },

    setSearchQuery(query) { return this.searchQuery = query; },
    
    loadConversation(c) {
        let id;
        c.participant_data.forEach(p => {
            id = p.id.chat_id || p.id.gaia_id;
            if (entity.isSelf(id)) { return; }
            p = entity[id];
            return this.selectedEntities.push({
                id: { chat_id: id
            },
                properties: {
                    photo_url: p.photo_url,
                    display_name: p.display_name || p.fallback_name
                }
            });
        }
        );
        this.group = this.selectedEntities.length > 1;
        this.id = __guard__(c.conversation_id, x => x.id) || __guard__(c.id, x1 => x1.id);
        this.initialName = this.name = c.name || "";
        this.initialSearchQuery = "";
        
        return updated('convsettings');
    },

    reset() {
        this.searchedEntities = [];
        this.selectedEntities = [];
        this.initialName = "";
        this.initialSearchQuery = "";
        this.searchQuery = "";
        this.name = "";
        this.id = null;
        this.group = false;
        return updated('convsettings');
    }


};


function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}