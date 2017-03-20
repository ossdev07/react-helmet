import React from "react";
import withSideEffect from "react-side-effect";
import deepEqual from "deep-equal";
import {
    convertReactPropstoHtmlAttributes,
    handleClientStateChange,
    mapStateOnServer,
    reducePropsToState,
    warn
} from "./HelmetUtils.js";
import {TAG_NAMES, VALID_TAG_NAMES} from "./HelmetConstants.js";

const Helmet = (Component) => class HelmetWrapper extends React.Component {
    /**
     * @param {Object} base: {"target": "_blank", "href": "http://mysite.com/"}
     * @param {Object} bodyAttributes: {"className": "root"}
     * @param {String} defaultTitle: "Default Title"
     * @param {Object} htmlAttributes: {"lang": "en", "amp": undefined}
     * @param {Array} link: [{"rel": "canonical", "href": "http://mysite.com/example"}]
     * @param {Array} meta: [{"name": "description", "content": "Test description"}]
     * @param {Array} noscript: [{TAG_PROPERTIES.INNER_HTML: "<img src='http://mysite.com/js/test.js'"}]
     * @param {Function} onChangeClientState: "(newState) => console.log(newState)"
     * @param {Array} script: [{"type": "text/javascript", "src": "http://mysite.com/js/test.js"}]
     * @param {Array} style: [{"type": "text/css", TAG_PROPERTIES.CSS_TEXT: "div{ display: block; color: blue; }"}]
     * @param {String} title: "Title"
     * @param {Object} titleAttributes: {"itemprop": "name"}
     * @param {String} titleTemplate: "MySite.com - %s"
     */
    static propTypes = {
        base: React.PropTypes.object,
        bodyAttributes: React.PropTypes.object,
        children: React.PropTypes.oneOfType([
            React.PropTypes.arrayOf(React.PropTypes.node),
            React.PropTypes.node
        ]),
        defaultTitle: React.PropTypes.string,
        htmlAttributes: React.PropTypes.object,
        link: React.PropTypes.arrayOf(React.PropTypes.object),
        meta: React.PropTypes.arrayOf(React.PropTypes.object),
        noscript: React.PropTypes.arrayOf(React.PropTypes.object),
        onChangeClientState: React.PropTypes.func,
        script: React.PropTypes.arrayOf(React.PropTypes.object),
        style: React.PropTypes.arrayOf(React.PropTypes.object),
        title: React.PropTypes.string,
        titleAttributes: React.PropTypes.object,
        titleTemplate: React.PropTypes.string
    };

    // Component.peek comes from react-side-effect:
    // For testing, you may use a static peek() method available on the returned component.
    // It lets you get the current state without resetting the mounted instance stack.
    // Don’t use it for anything other than testing.
    static peek = Component.peek;

    static rewind = () => {
        let mappedState = Component.rewind();
        if (!mappedState) {
            // provide fallback if mappedState is undefined
            mappedState = mapStateOnServer({
                baseTag: [],
                bodyAttributes: {},
                htmlAttributes: {},
                linkTags: [],
                metaTags: [],
                noscriptTags: [],
                scriptTags: [],
                styleTags: [],
                title: "",
                titleAttributes: {}
            });
        }

        return mappedState;
    };

    static set canUseDOM(canUseDOM) {
        Component.canUseDOM = canUseDOM;
    }

    shouldComponentUpdate(nextProps) {
        return !deepEqual(this.props, nextProps);
    }

    mapNestedChildrenToProps(child, nestedChildren) {
        if (!nestedChildren) {
            return null;
        }

        switch (child.type) {
            case TAG_NAMES.SCRIPT:
            case TAG_NAMES.NOSCRIPT:
                return {
                    innerHTML: nestedChildren
                };

            case TAG_NAMES.STYLE:
                return {
                    cssText: nestedChildren
                };
        }

        return nestedChildren;
    }

    flattenArrayTypeChildren({
        child,
        arrayTypeChildren,
        newChildProps,
        nestedChildren
    }) {
        return {
            ...arrayTypeChildren,
            [child.type]: [
                ...arrayTypeChildren[child.type] || [],
                {
                    ...newChildProps,
                    ...this.mapNestedChildrenToProps(child, nestedChildren)
                }
            ]
        };
    }

    mapObjectTypeChildren({
        child,
        newProps,
        newChildProps,
        nestedChildren
    }) {
        switch (child.type) {
            case TAG_NAMES.TITLE:
                return {
                    ...newProps,
                    [child.type]: nestedChildren,
                    titleAttributes: {...newChildProps}
                };

            case TAG_NAMES.BODY:
                return {
                    ...newProps,
                    bodyAttributes: {...newChildProps}
                };

            case TAG_NAMES.HTML:
                return {
                    ...newProps,
                    htmlAttributes: {...newChildProps}
                };
        }

        return {
            ...newProps,
            [child.type]: {...newChildProps}
        };
    }

    mapArrayTypeChildrenToProps(arrayTypeChildren, newProps) {
        let newFlattenedProps = {...newProps};

        Object.keys(arrayTypeChildren)
            .forEach(arrayChildName => {
                newFlattenedProps = {
                    ...newFlattenedProps,
                    [arrayChildName]: arrayTypeChildren[arrayChildName]
                };
            });

        return newFlattenedProps;
    }

    warnOnInvalidChildren(child, nestedChildren) {
        if (
            process.env.NODE_ENV !== "production" &&
            nestedChildren &&
            typeof nestedChildren !== "string"
        ) {
            if (!VALID_TAG_NAMES.some(name => child.type === name)) {
                if (typeof child.type === "function") {
                    return warn(`You may be attempting to nest <Helmet> components within each other, which is not allowed. Refer to our API for more information.`);
                }

                return warn(`Only elements types ${VALID_TAG_NAMES.join(", ")} are allowed. Helmet does not support rendering <${child.type}> elements. Refer to our API for more information.`);
            }

            throw new Error(`Helmet expects a string as a child of <${child.type}>. Did you forget to wrap your children in braces? ( <${child.type}>{\`\`}</${child.type}> ) Refer to our API for more information.`);
        }

        return true;
    }

    mapChildrenToProps(children, newProps) {
        let arrayTypeChildren = {};

        React.Children.forEach(children, (child) => {
            const {children: nestedChildren, ...childProps} = child.props;
            const newChildProps = convertReactPropstoHtmlAttributes(childProps);

            this.warnOnInvalidChildren(child, nestedChildren);

            switch (child.type) {
                case TAG_NAMES.LINK:
                case TAG_NAMES.META:
                case TAG_NAMES.NOSCRIPT:
                case TAG_NAMES.SCRIPT:
                case TAG_NAMES.STYLE:
                    arrayTypeChildren = this.flattenArrayTypeChildren({
                        child,
                        arrayTypeChildren,
                        newChildProps,
                        nestedChildren
                    });
                    break;

                default:
                    newProps = this.mapObjectTypeChildren({
                        child,
                        newProps,
                        newChildProps,
                        nestedChildren
                    });
                    break;
            }
        });

        newProps = this.mapArrayTypeChildrenToProps(arrayTypeChildren, newProps);
        return newProps;
    }

    render() {
        const {children, ...props} = this.props;
        let newProps = {...props};

        if (children) {
            newProps = this.mapChildrenToProps(children, newProps);
        }

        return <Component {...newProps} />;
    }
};

const NullComponent = () => null;

const HelmetSideEffects = withSideEffect(
    reducePropsToState,
    handleClientStateChange,
    mapStateOnServer
)(NullComponent);

const HelmetExport = Helmet(HelmetSideEffects);
HelmetExport.renderStatic = HelmetExport.rewind;

export {HelmetExport as Helmet};
export default HelmetExport;
