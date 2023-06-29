import { Injectable } from '@angular/core';
import api from "./main";

import { join } from '@fireflysemantics/join';

@Injectable({ providedIn: 'root' })
export class STACService {

    /** start http service client */
    constructor() { }

    /**
     * get stac version
     */
    public async getVersion(url: string): Promise<any> {
        const { data } = await api.get(`${url}`);
        if (!data['stac_version']) {
            const { data } = await api.get(`${url}/stac`);
            return data;
        }
        return data;
    }

    /**
     * get collections
     */
    public async getCollections(url: string, params: any = { }): Promise<any> {
        let urlSuffix = '/collections'
        const { data } = await api.get(`${url}${urlSuffix}`, { params, headers: {'Content-Type': 'application/json'}});
        return data;
    }

    /**
     * get items by collections
     */
    public async getItemsByCollection(url: string, collections: string[], query: any, params: any = { }): Promise<any> {
        const q = {
            collections,
            ...query
        }

        let urlSuffix = `/search`
        const { data } = await api.post(join(url, urlSuffix), q, { params, headers: {'Content-Type': 'application/json'}});
        return data;
    }

    /**
     * get collection informations
     */
    public async getCollectionInfo(url: string, collection: string, params: any = { }): Promise<any> {
        let urlSuffix = `/collections/${collection}`
        const { data } = await api.get(`${url}${urlSuffix}`, { params, headers: {'Content-Type': 'application/json'}});
        return data;
    }

}
