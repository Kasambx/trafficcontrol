/*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

import { Location } from "@angular/common";
import { Component, type OnInit } from "@angular/core";
import { FormControl } from "@angular/forms";
import { MatDialog } from "@angular/material/dialog";
import { ActivatedRoute } from "@angular/router";
import { LocalizationMethod, localizationMethodToString, TypeFromResponse, type ResponseCacheGroup } from "trafficops-types";

import { CacheGroupService, TypeService } from "src/app/api";
import { DecisionDialogComponent, type DecisionDialogData } from "src/app/shared/dialogs/decision-dialog/decision-dialog.component";
import { TpHeaderService } from "src/app/shared/tp-header/tp-header.service";

/**
 * The controller for the form page for creating/updating a Cache Group.
 */
@Component({
	selector: "tp-cache-group-details",
	styleUrls: ["./cache-group-details.component.scss"],
	templateUrl: "./cache-group-details.component.html",
})
export class CacheGroupDetailsComponent implements OnInit {
	public new = false;
	public cacheGroup: ResponseCacheGroup = {
		fallbackToClosest: true,
		fallbacks: [],
		id: -1,
		lastUpdated: new Date(),
		latitude: 0,
		localizationMethods: [
			LocalizationMethod.CZ,
			LocalizationMethod.DEEP_CZ,
			LocalizationMethod.GEO
		],
		longitude: 0,
		name: "",
		parentCachegroupId: null,
		parentCachegroupName: null,
		secondaryParentCachegroupId: null,
		secondaryParentCachegroupName: null,
		shortName: "",
		typeId: -1,
		typeName: ""
	};

	public cacheGroups: Array<ResponseCacheGroup> = [];
	public types: Array<TypeFromResponse> = [];
	public typeCtrl = new FormControl<number | null>(null);
	public showErrors = false;

	public readonly localizationMethods: readonly LocalizationMethod[] = [
		LocalizationMethod.CZ,
		LocalizationMethod.DEEP_CZ,
		LocalizationMethod.GEO
	];

	/**
	 * A description of the Cache Group's selected Type - or `null` if no Type
	 * is (yet) selected.
	 */
	public get selectedTypeDescription(): string | null {
		const type = this.types.find(t => t.id === this.typeCtrl.value);
		if (!type) {
			return null;
		}
		return type.description;
	}

	constructor(
		private readonly route: ActivatedRoute,
		private readonly api: CacheGroupService,
		private readonly typesAPI: TypeService,
		private readonly location: Location,
		private readonly dialog: MatDialog,
		private readonly header: TpHeaderService
	) {
	}

	public localizationMethodToString = localizationMethodToString;

	/**
	 * Angular lifecycle hook where data is initialized.
	 */
	public async ngOnInit(): Promise<void> {
		const ID = this.route.snapshot.paramMap.get("id");
		if (ID === null) {
			console.error("missing required route parameter 'id'");
			return;
		}

		const cgsPromise = this.api.getCacheGroups().then(cgs => this.cacheGroups = cgs);
		const typePromise = this.typesAPI.getTypesInTable("cachegroup").then(ts => this.types = ts);
		if (ID === "new") {
			this.setTitle();
			this.new = true;
			await Promise.all([typePromise, cgsPromise]);
			return;
		}
		const numID = parseInt(ID, 10);
		if (Number.isNaN(numID)) {
			throw new Error(`route parameter 'id' was non-number: ${ID}`);
		}

		await cgsPromise;
		const idx = this.cacheGroups.findIndex(c => c.id === numID);
		if (idx < 0) {
			console.error(`no such Cache Group: #${ID}`);
			return;
		}
		this.cacheGroup = this.cacheGroups.splice(idx, 1)[0];
		this.typeCtrl.setValue(this.cacheGroup.typeId);
		this.updateLocalizationMethods();
		this.setTitle();
		await typePromise;
	}

	/**
	 * Sets the title of the page to either "new" or the name of the displayed
	 * Cache Group, depending on the value of
	 * {@link CacheGroupDetailsComponent.new}.
	 */
	private setTitle(): void {
		const title = this.new ? "New Cache Group" : `Cache Group: ${this.cacheGroup.name}`;
		this.header.headerTitle.next(title);
	}

	/**
	 * Gets all Cache Groups eligible to be the parent of this Cache Group.
	 *
	 * @returns Every Cache Group except this one and its secondary parent (if
	 * it has one) and any of its "fallbacks".
	 */
	public parentCacheGroups(): Array<ResponseCacheGroup> {
		return this.cacheGroups.filter(
			cg => this.cacheGroup.fallbacks.every(f => f !== cg.name) && cg.id !== this.cacheGroup.secondaryParentCachegroupId
		);
	}

	/**
	 * Gets all Cache Groups eligible to be the secondary parent of this Cache
	 * Group.
	 *
	 * @returns Every Cache Group except this one and its primary parent (if it
	 * has one) and any of its "fallbacks".
	 */
	public secondaryParentCacheGroups(): Array<ResponseCacheGroup> {
		return this.cacheGroups.filter(
			cg => this.cacheGroup.fallbacks.every(f => f !== cg.name) && cg.id !== this.cacheGroup.parentCachegroupId
		);
	}

	/**
	 * Gets all Cache Groups eligible to be a "fallback" for this Cache Group.
	 *
	 * @returns Every Cache Group except this one and its parent(s).
	 */
	public fallbacks(): Array<ResponseCacheGroup> {
		return this.cacheGroups.filter(
			cg => cg.id !== this.cacheGroup.parentCachegroupId && cg.id !== this.cacheGroup.secondaryParentCachegroupId
		);
	}

	/**
	 * Deletes the Cache Group.
	 */
	public async delete(): Promise<void> {
		if (this.new) {
			console.error("Unable to delete new Cache Group");
			return;
		}
		const ref = this.dialog.open<DecisionDialogComponent, DecisionDialogData, boolean>(
			DecisionDialogComponent,
			{
				data: {
					message: `Are you sure you want to delete Cache Group ${this.cacheGroup.name} (#${this.cacheGroup.id})?`,
					title: "Confirm Delete"
				}
			}
		);
		ref.afterClosed().subscribe(result => {
			if (result) {
				this.api.deleteCacheGroup(this.cacheGroup);
				this.location.replaceState("core/cache-groups");
			}
		});
	}

	/**
	 * Submits new/updated Cache Group.
	 *
	 * @param e HTML form submission event.
	 */
	public async submit(e: Event): Promise<void> {
		e.preventDefault();
		e.stopPropagation();
		this.showErrors = true;
		if (this.typeCtrl.invalid) {
			return;
		}
		const {value} = this.typeCtrl;
		if (value === null) {
			return console.error("cannot create Cache Group of null Type");
		}
		this.cacheGroup.typeId = value;
		this.cacheGroup.shortName = this.cacheGroup.name;
		if (this.new) {
			this.cacheGroup = await this.api.createCacheGroup(this.cacheGroup);
			this.new = false;
		} else {
			this.cacheGroup = await this.api.updateCacheGroup(this.cacheGroup);
		}
		this.setTitle();
	}

	/**
	 * Updates the localization methods of the Cache Group based on user
	 * selection.
	 *
	 * Specifically, selecting none is not allowed, so this will change to
	 * select all available methods if none are selected.
	 */
	public updateLocalizationMethods(): void {
		if (this.cacheGroup.localizationMethods.length === 0) {
			this.cacheGroup.localizationMethods = [...this.localizationMethods];
		}
	}
}
