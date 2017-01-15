module.exports = view(models =>
	div({class:'listheadlabel'}, function() {
		if (process.platform !== 'darwin') {
			button({title: i18n.__('menu.title:Menu'), onclick: togglemenu}, () => i({class:'material-icons'}, "menu"));
		}
		return span(i18n.__n("conversation.title:Conversations", 2));
	})
);

var togglemenu = function() {
	if (process.platform !== 'darwin') {
		return action('togglemenu');
	}
};
